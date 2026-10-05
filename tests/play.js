/* ============================================================
   اختبار لعب حقيقي بدون إنترنت (Offline Play-through)
   بيشغّل لعبة كاملة من أولها لآخرها والشبكة مقفولة، وبعدين
   بيعيد التحميل للتأكد إن التقدم اتحفظ.
   الاستخدام:
     node tests/play.js file:///.../ahmed-quiz-offline.html
   ============================================================ */
let chromium;
try { chromium = require('playwright-core').chromium; }
catch (e) { chromium = require('/usr/share/nodejs/playwright-core').chromium; }

const TARGET=process.argv[2]||'file:///home/kali/ahmed-quiz-game/download/ahmed-quiz-offline.html';
let pass=0,fail=0;
const ck=(name,cond,extra)=>{
  if(cond){pass++;console.log('PASS: '+name)}
  else{fail++;console.log('!! FAIL: '+name+(extra!==undefined?' → '+JSON.stringify(extra):''))}
};

(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await ctx.newPage();
  const errs=[];
  page.on('pageerror',e=>errs.push(String(e).split('\n')[0].slice(0,90)));
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,90))});
  const netFail=[];
  page.on('requestfailed',r=>netFail.push(r.url().slice(0,80)));

  await ctx.setOffline(true);                       // ✈️ مقفولة تمامًا
  await page.goto(TARGET,{waitUntil:'load',timeout:60000});
  await page.waitForTimeout(3200);
  ck('boots with network OFF',await page.evaluate(()=>typeof show==='function'&&!document.getElementById('splash')));
  ck('no splash left',!(await page.evaluate(()=>!!document.getElementById('splash'))));

  const qCount=await page.evaluate(()=>{const Q=window.QUESTIONS||{};return Object.keys(Q).reduce((a,k)=>a+(Q[k]||[]).length,0)});
  ck('questions loaded offline',qCount>400,{qCount});

  // ابدأ لعبة من الرئيسية
  const started=await page.evaluate(()=>{try{set.qCount=4;startGame('mixed');return true}catch(e){return String(e)}});
  ck('startGame() runs',started===true,{started});
  await page.waitForTimeout(700);
  const inGame=await page.evaluate(()=>({active:(document.querySelector('.screen.active')||{}).id,
                                        opts:document.querySelectorAll('.ans-btn').length}));
  ck('game screen opens',inGame.active==='game',inGame);
  ck('answer options rendered',inGame.opts>=2,inGame);

  // ا��عب 10 أسئلة باختيار الإجابة الأولى
  let answered=0,progressSeen=0;
  for(let i=0;i<12;i++){
    const step=await page.evaluate(()=>{
      const active=(document.querySelector('.screen.active')||{}).id;
      if(active==='result')return 'finished';
      const opts=[].slice.call(document.querySelectorAll('.ans-btn')).filter(o=>!o.classList.contains('disabled')&&getComputedStyle(o).display!=='none');
      if(opts.length){opts[0].click();return 'answered'}
      return 'wait';
    });
    if(step==='finished')break;
    if(step==='wait'){await page.waitForTimeout(400);i--;continue}
    if(step==='answered')answered++;
    await page.waitForTimeout(1500);
    const st=await page.evaluate(()=>({active:(document.querySelector('.screen.active')||{}).id,
      bar:!!document.getElementById('progFill'),num:(document.getElementById('gNum')||{}).textContent}));
    if(st.bar)progressSeen++;
  }
  ck('answered multiple questions',answered>=3,{answered});
  ck('progress bar advanced',progressSeen>0,{progressSeen});

  const atResult=await page.evaluate(()=>(document.querySelector('.screen.active')||{}).id==='result');
  ck('game reaches result screen',atResult,{atResult});
  await page.waitForTimeout(700);
  const after=await page.evaluate(()=>{
    try{const s=JSON.parse(localStorage.getItem('iq_state')||'{}');
      return {games:s.games,coins:s.coins,answered:s.answered,correct:s.correct,stored:!!s.games};
    }catch(e){return {err:String(e)}}
  });
  ck('game counted after finish',after.games>=1,after);
  ck('coins/points awarded',(after.coins>0||after.correct>0||after.answered>0),after);

  // إعادة تحميل بدون نت — لازم التقدم يفضل موجود
  await page.reload({waitUntil:'load',timeout:60000});
  await page.waitForTimeout(3000);
  const reloaded=await page.evaluate(()=>{
    try{const s=JSON.parse(localStorage.getItem('iq_state')||'{}');
      const nm=document.getElementById('pfName');
      return {games:s.games,profileName:nm?nm.textContent:''};
    }catch(e){return {}}
  });
  ck('progress survives reload (offline)',reloaded.games>=1,reloaded);
  ck('profile renders player name',!!reloaded.profileName,reloaded);

  // رجوع للرئيسية والشاشة شغالة
  await page.evaluate(()=>{try{show('home')}catch(e){}});
  await page.waitForTimeout(400);
  ck('home renders after reload',await page.evaluate(()=>(document.querySelector('.screen.active')||{}).id==='home'));
  ck('no JS errors during play-through',errs.filter(e=>!/ERR_INTERNET_DISCONNECTED|net::ERR_FAILED|Failed to load resource/.test(e)).length===0,errs.slice(0,3));
  ck('no external resource required offline',netFail.length===0,netFail.slice(0,4));

  await browser.close();
  console.log('\n=== '+pass+' PASS / '+fail+' FAIL ===');
  process.exit(fail?1:0);
})();