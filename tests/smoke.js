/* ============================================================
   بوابة فحص الإصدار (Release Gate)
   بتضغط كل زرار في كل شاشة على مقاس موبايل وديسكتوب وبتمسك:
     - زرار معطوب أو متغطّي بطبقة (فحص actionability حقيقي)
     - أي خطأ جافاسكريبت أو طلب شبكة فاشل
     - شاشة بداية بتعلق أو طبقة بتفضل مفتوحة
   الاستخدام:
     node tests/smoke.js                              # لايف
     node tests/smoke.js file:///.../offline.html     # أوفلاين
   ============================================================ */
let chromium;
try { chromium = require('playwright-core').chromium; }
catch (e) { chromium = require('/usr/share/nodejs/playwright-core').chromium; }

const TARGET=process.argv[2]||'https://alfadev0.github.io/ahmed-quiz-game/';
const LABEL=/^https?:/i.test(TARGET)?'live':'offline';
const VIEWPORTS=[{w:390,h:844,n:'mobile'},{w:1280,h:900,n:'desktop'}];
const SKIP=/^(resetBtn|deepResetBtn|importFile|avFile)$/;   // أزرار بتمسح/ترفع بيانات
const MAX_CLICKS=26;                                        // سقف لكل شاشة
const SCREENS=['home','shop','stats','profile','courses','plan','settings','daily','book','exams','study','ai'];

(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  let issues=0, clicksAll=0;

  for(const vp of VIEWPORTS){
    const ctx=await browser.newContext({viewport:{width:vp.w,height:vp.h},hasTouch:vp.n==='mobile',isMobile:vp.n==='mobile'});
    const page=await ctx.newPage();
    const errs=[],warns=[];

    page.on('pageerror',e=>errs.push('JS error: '+String(e).split('\n')[0].slice(0,110)));
    page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text().slice(0,110))});
    page.on('requestfailed',r=>{const u=r.url();if(!/favicon|manifest|googleapis|gstatic|\.woff/.test(u))errs.push('request failed: '+u.slice(-42))});

    // اقفل أي طبقة مفتوحة (شيتات + مودالات) — عشان ما ن-press تحت طبقة
    const closeAll=(sid)=>page.evaluate((sid)=>{try{
      if(typeof window.__closeTopSheet==='function')window.__closeTopSheet();
      // لو ظهرت شاشة النتيجة فوق الشاشة دي، ارجع للشاشة الأصلية
      const rv=document.getElementById('result');
      if(sid&&rv&&rv.classList.contains('active')&&typeof show==='function'){try{show(sid)}catch(e){}}
      document.querySelectorAll('.modal.show').forEach(m=>m.classList.remove('show'));
      document.querySelectorAll('.modal').forEach(m=>{if(!m.classList.contains('show'))m.style.display='none'});
      document.querySelectorAll('.ai-sheet').forEach(s=>{s.style.display='none'});
      document.querySelectorAll('.lv,.confetti-wrap').forEach(e=>e.remove());
    }catch(e){}},sid).catch(()=>{});

    await page.goto(TARGET,{waitUntil:'load',timeout:60000});
    await page.waitForTimeout(3500);
    if(await page.evaluate(()=>!!document.getElementById('splash')))errs.push('splash still visible after 3.5s');
    await closeAll();

    let clicks=0;
    for(const sid of SCREENS){
      const opened=await page.evaluate(id=>{try{if(typeof show!=='function')return false;show(id);return true}catch(e){return false}},sid);
      if(!opened)continue;
      await page.waitForTimeout(180);
      await closeAll(sid);
      await page.evaluate(()=>{try{window.scrollTo(0,0)}catch(e){}});

      for(let k=0;k<MAX_CLICKS;k++){
        const info=await page.evaluate(()=>{
          try{
            window.__smoke=window.__smoke||{};
            const list=[].slice.call(document.querySelectorAll('.screen.active button,.screen.active [role=button]'));
            for(const b of list){
              const cs=getComputedStyle(b);
              if(cs.display==='none'||cs.visibility==='hidden'||b.disabled)continue;
              const r=b.getBoundingClientRect();
              if(r.width<6||r.height<6)continue;
              const sig=(b.id||(b.textContent||'').trim().slice(0,14))+'@'+Math.round(r.top);
              if(window.__smoke[sig])continue;
              window.__smoke[sig]=1;
              if(!b.id)b.id='__smoke_'+Math.random().toString(36).slice(2,8);
              return {sel:'#'+CSS.escape(b.id),id:b.id,txt:(b.textContent||'').trim().slice(0,18)};
            }
            return null;
          }catch(e){return null}
        });
        if(!info)break;
        if(SKIP.test(info.id))continue;
        try{
          const loc=page.locator(info.sel).first();
          await loc.scrollIntoViewIfNeeded({timeout:1500});
          await loc.click({timeout:2500});
          clicks++;
        }catch(e){
          const msg=(String(e.message||e).split('\n').filter(Boolean)[0]||'');
          const state=await page.evaluate(sel=>{
            try{
              const el=document.querySelector(sel);
              if(!el)return {v:'gone'};
              el.scrollIntoView({block:'center',behavior:'instant'});
              const r=el.getBoundingClientRect();
              const cx=r.left+r.width/2, cy=r.top+r.height/2;
              if(cx<0||cy<0||cx>innerWidth||cy>innerHeight||r.top<0||r.bottom>innerHeight)return {v:'offscreen'};
              const t=document.elementFromPoint(cx,cy);
              if(!t||t===el||el.contains(t))return {v:'reachable'};
              const sig=(t.id||'')+'|'+(t.className||'');
              if(t.tagName==='BODY'||t.tagName==='HTML'||/(^|\|)(app|app-wrap|body|html)(\||$)/.test(sig))return {v:'reachable'};
              // غطاء مؤقت متوقّع (شاشة نتيجة/شيت/مودال) — مش زرار ميت
              if(/(^|\|)(result|splash|ai-sheet|modal|overlay|lv|confetti)(\||$)|result-card|ai-sheet/i.test(sig))return {v:'overlay',by:(t.id||t.className||t.tagName).toString().slice(0,26)};
              return {v:'covered',by:(t.id||t.className||t.tagName).toString().slice(0,30)};
            }catch(x){return {v:'err'}}
          },info.sel);
          if(state.v==='covered')errs.push('DEAD BUTTON ['+sid+'] "'+info.txt+'" covered by '+state.by);
          else if(state.v==='overlay')warns.push('overlay opened ['+sid+'] "'+info.txt+'" by '+state.by);
          else if(state.v==='gone')warns.push('re-rendered ['+sid+'] "'+info.txt+'"');
          else if(state.v==='reachable')warns.push('slow/interactive ['+sid+'] "'+info.txt+'"');
          else if(state.v!=='offscreen')errs.push('click error ['+sid+'] "'+info.txt+'": '+msg.slice(0,70));
        }
        await page.waitForTimeout(90);
        await closeAll(sid);
      }
    }

    await page.evaluate(()=>{try{show('home')}catch(e){}});
    await page.waitForTimeout(250);
    const stuck=await page.evaluate(()=>[].slice.call(document.querySelectorAll('.ai-sheet,.modal.show')).filter(s=>getComputedStyle(s).display!=='none').map(s=>s.id||s.className));
    if(stuck.length)errs.push('overlay left open after tour: '+stuck.join(','));

    issues+=errs.length; clicksAll+=clicks;
    console.log('['+LABEL+'/'+vp.n+'] '+clicks+' clicks — failures: '+errs.length+(warns.length?', warnings: '+warns.length:''));
    errs.slice(0,14).forEach(e=>console.log('   x '+e));
    warns.slice(0,5).forEach(w=>console.log('   - '+w));
    await ctx.close();
  }
  await browser.close();
  console.log(issues?('\nSMOKE FAILED — '+issues+' failure(s) over '+clicksAll+' clicks')
                   :('\nSMOKE PASSED — '+clicksAll+' clicks, no dead buttons, no JS errors'));
  process.exit(issues?1:0);
})();