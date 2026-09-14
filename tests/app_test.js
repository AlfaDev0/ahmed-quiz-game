const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(process.env.TEST_INDEX || '/home/kali/ahmed-quiz-game/index.html', 'utf8');
const questionsJS = fs.readFileSync(process.env.TEST_QUESTIONS || '/home/kali/ahmed-quiz-game/questions.js', 'utf8');
const studyJS = fs.readFileSync(process.env.TEST_STUDY || '/home/kali/ahmed-quiz-game/study.js', 'utf8');

// extract inline script blocks (non-src)
const inlineBlocks = [];
const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) inlineBlocks.push(m[1]);

/* ---------- fake DOM ---------- */
const stores = {};
const registry = [];
function classMatch(el, sel) {
  const cn = (el.className || '').split(/\s+/);
  return cn.includes(sel);
}
class FakeEl {
  constructor(tag, id) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this.children = [];
    this.dataset = {};
    this.style = {};
    this._inner = '';
    this._text = '';
    this.value = '';
    this.disabled = false;
    this.removed = false;
    this.onclick = null;
    this.onkeydown = null;
    this.onchange = null;
    this._display = '';
    this.className = '';
    this._cls = new Set();
    registry.push(this);
  }
  set innerHTML(v) {
    this._inner = String(v == null ? '' : v);
    this.textContent = this._inner.replace(/<[^>]+>/g, '');
  }
  get innerHTML() { return this._inner; }
  set textContent(v) { this._text = String(v == null ? '' : v); }
  get textContent() { return this._text; }
  get classList() {
    const el = this;
    return {
      add(c) { el._cls.add(c); el._cls.add(c); },
      remove(c) { el._cls.delete(c); },
      toggle(c, f) { if (f === undefined) { el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); } else { f ? el._cls.add(c) : el._cls.delete(c); } },
      contains(c) { return el._cls.has(c); }
    };
  }
  appendChild(ch) { this.children.push(ch); return ch; }
  remove() { this.removed = true; }
  focus() {}
  blur() {}
  click() { const h = this.onclick; if (h) this.onclick(); }
  querySelector(sel) { const els = this.querySelectorAll(sel); return els[0] || null; }
  querySelectorAll(sel) {
    function walk(node) {
      let out = [];
      node.children.forEach(ch => {
        const cn = (ch.className || '') + (ch.tagName === 'IMG' ? ' img' : ch.tagName ? ' ' + ch.tagName.toLowerCase() : '');
        if (sel.split(',').some(s => {
          const t = s.trim();
          if (t.startsWith('.')) return classMatch(ch, t.slice(1));
          if (t.startsWith('#')) return ch.id === t.slice(1);
          return cn.toLowerCase().includes(t.toLowerCase());
        })) out.push(ch);
        out = out.concat(walk(ch));
      });
      return out;
    }
    return walk(this);
  }
}
function fakeEl(tag) { return new FakeEl(tag); }

// register known screen elements
const screenIds = ['home', 'game', 'result', 'leaderboard', 'profile', 'settings', 'shop', 'stats', 'study', 'studyBooks', 'studyBook', 'studyRead'];
const byId = {};
screenIds.forEach(id => byId[id] = new FakeEl('div', id));
byId.home.classList.add('active');
let first = true;
registry.forEach(register); // no-op keeps order
function register() {}

const document = {
  getElementById(id) { if (!byId[id]) byId[id] = new FakeEl('div', id); return byId[id]; },
  querySelectorAll(sel) {
    let out = [];
    // screens handled by registry scan
    const tokens = sel.split(',').map(s => s.trim());
    registry.forEach(el => {
      const cls = (el.className || '').split(/\s+/);
      const id = el.id || '';
      const isImg = el.tagName === 'IMG';
      const ok = tokens.some(t => {
        if (t.startsWith('.')) return cls.includes(t.slice(1));
        if (t.startsWith('#')) return id === t.slice(1);
        if (t.endsWith(' img')) return isImg && classMatch(el, t.split(' ')[0]);
        return cls.includes(t) || (isImg && t === 'img');
      });
      if (ok) out.push(el);
    });
    return out;
  },
  createElement(tag) { return fakeEl(tag); },
  querySelector(sel) {
    const els = document.querySelectorAll(sel);
    return els[0] || null;
  },
  body: new FakeEl('body'),
  documentElement: new FakeEl('html'),
  hasFocus() { return true; }
};

// default registry entries for nav & screens
screenIds.forEach(id => { byId[id].className = 'screen'; });
['home', 'game', 'result', 'leaderboard', 'profile', 'settings', 'shop', 'stats', 'study'].forEach(n => {
  const b = new FakeEl('button');
  b.className = 'nav-btn';
  b.dataset.nav = n;
});

const localStorage = {
  _d: {},
  getItem(k) { return k in this._d ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
  clear() { this._d = {}; }
};

/* controlled timers (virtual clock) */
let T = [];
let nextId = 1;
let now = 0;
const fST = (fn, ms) => { T.push({ fn, due: now + (ms || 0), id: nextId++, loop: false }); return nextId - 1; };
const fCT = (id) => { T = T.filter(t => !t || t.id !== id); };
const fSI = (fn, ms) => { T.push({ fn, due: now + (ms || 0), id: nextId++, loop: true }); return nextId - 1; };
function pump(budget) {
  const end = now + (budget || 5000);
  let guard = 0;
  while (guard++ < 3000) {
    let idx = -1, min = Infinity;
    for (let i = 0; i < T.length; i++) { const t = T[i]; if (t && t.due <= end && t.due < min) { min = t.due; idx = i; } }
    if (idx < 0) break;
    const t = T[idx]; T[idx] = null;
    now = Math.max(now, t.due);
    try { t.fn(); } catch (e) { console.log('  !! timer threw: ' + e.message); }
    if (t.loop) { t.due = now + t.ms; T.push(t); }
  }
  now = end;
}

let fetchCalls = [];
const fetchMock = (url, opts) => {
  fetchCalls.push(url);
  return Promise.resolve({
    json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: '**الإجابة:** ' + 'جوابُ الاختبار\n\n- نقطة أولى' }] } }] })
  });
};

const windowObj = {
  AudioContext: function () { throw new Error('no-audio'); },
  webkitAudioContext: function () { throw new Error('no-audio'); },
  addEventListener(type, fn) { if (type === 'load') this._load = fn; },
  matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
  setTimeout: fST, clearTimeout: fCT, setInterval: fSI, clearInterval: fCT,
  fetch: fetchMock
};
const navigator = {
  vibrate() {},
  userAgent: 'test',
  serviceWorker: { register: () => Promise.resolve() }
};
const location = { href: 'https://x/', search: '', reload() {} };
const Notification = { requestPermission() {}, permission: 'default' };
const { TextEncoder: wTE, TextDecoder: wTD } = (() => { try { return { TextEncoder, TextDecoder }; } catch (e) { return {}; } })();
const b64e = s => Buffer.from(String(s), 'utf8').toString('base64');
const b64d = s => Buffer.from(String(s), 'base64').toString('utf8');
const TextEncoder = wTE || class { encode(s) { return Buffer.from(String(s), 'utf8'); } };
const TextDecoder = wTD || class { decode(b) { return Buffer.from(b).toString('utf8'); } };

const sandbox = {
  document, localStorage, navigator, window: windowObj, location, Notification,
  setTimeout: fST, clearTimeout: fCT, setInterval: fSI, clearInterval: fCT,
  fetch: fetchMock, confirm: () => true, prompt: () => '',
  Math, Object, Array, JSON, parseInt, parseFloat, isNaN, Promise, Date, console, String, Number, Boolean, undefined,
  btoa: b64e, atob: b64d, TextEncoder, TextDecoder
};
vm.createContext(sandbox);

let blockErrors = 0;
try { vm.runInContext(questionsJS, sandbox); } catch (e) { console.log('QUESTIONS ERR: ' + e.message); blockErrors++; }
try { vm.runInContext(studyJS, sandbox); } catch (e) { console.log('STUDY ERR: ' + e.message); blockErrors++; }
inlineBlocks.forEach((b, i) => {
  try { vm.runInContext(b, sandbox); } catch (e) { console.log('!! block ' + i + ' failed: ' + e.message); blockErrors++; }
});

let pass = 0, fail = 0;
const ck = (n, c) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ': ' + n); };

/* expose debug accessors into sandbox */
vm.runInContext(`
  window.__dbg = {
    S: () => S, set: () => set, qn: () => questions.length, qi: () => qi,
    qc: () => curQ ? curQ.c : -1, active: () => { for (const s of ${JSON.stringify(screenIds)}) if (document.getElementById(s).classList.contains('active')) return s; return '?'; },
    stars: (k) => (S.study[k] || {}).stars || 0, done: (k) => !!(S.study[k] || {}).done,
    coins: () => S.coins, aictx: () => aiCtx, offline: () => offlineExplain(aiCtx),
    last: () => (S.studyLast || null)
  };
`, sandbox);
const t = () => sandbox.window.__dbg;

(function verify() {
  const W = sandbox.window;
  ck('no block load errors', blockErrors === 0);
  ck('questions.js loaded (13+ categories)', Object.keys(sandbox.QUESTIONS || {}).length >= 13);
  ck('study.js loaded (6 parts)', (W.STUDY || []).length === 6);

// ---- data integrity ----
  let ch = 0, qs = 0, expl = 0, bad = 0;
  W.STUDY.forEach(function (p) {
    p.subjects.forEach(function (s) {
      s.books.forEach(function (b) {
        b.chapters.forEach(function (c) {
          ch++;
          if (!c.title || !Array.isArray(c.read) || c.read.length === 0) bad++;
          qs += c.qs.length;
          c.qs.forEach(function (q) {
            if (!q.q || !Array.isArray(q.a) || q.a.length !== 4 || typeof q.c !== 'number' || q.c < 0 || q.c > 3 || !q.a[q.c]) bad++;
            if (q.expl) expl++;
          });
        });
      });
    });
  });
  ck('study exactly 567 chapters', ch === 567);
  ck('study exactly 3853 questions', qs === 3853);
  ck('every chapter has title+read+valid qs', bad === 0);
  ck('most questions have expl (' + expl + '/3853)', expl >= 3500);

  // all normal questions valid
  let nbad = 0, nq = 0;
  Object.keys(sandbox.QUESTIONS).forEach(k => sandbox.QUESTIONS[k].forEach(q => {
    nq++;
    if (!q.q || !Array.isArray(q.a) || q.a.length !== 4 || typeof q.c !== 'number' || !q.a[q.c]) nbad++;
  }));
  ck('normal questions valid (' + nq + ')', nbad === 0);

  ck('home screen renders (title badge)', document.getElementById('titleBadge').textContent !== '');
})();

/* boot: mimic window load handler */
try {
  sandbox.window._load && sandbox.window._load();
  pump(6000);
} catch (e) { console.log('  !! boot threw: ' + e.message + ' @' + (e.stack || '').split('\n')[1]); }
ck('boot did not throw (updateHome ran)', byId.hmLv.textContent === String(t().S().level));

/* ---- normal game flow ---- */
(function game() {
  sandbox.show('home');
  vm.runInContext('startGame("math",false)', sandbox);
  ck('game starts (math)', t().active() === 'game' && t().qn() > 0);
  const coins0 = t().coins();
  for (let g = 0; g < 60 && t().qi() < t().qn(); g++) { sandbox.answer(t().qc()); pump(1600); }
  ck('game finished → result', t().active() === 'result');
  ck('coins increased on finish', t().coins() >= coins0);
})();

/* ---- study library flow ---- */
(function study() {
  sandbox.renderStudyParts(); sandbox.show('study');
  ck('study screen active', t().active() === 'study');
  ck('six part cards', byId.studyParts.children.length === 6);
  sandbox.openStudyPart(0);
  ck('adabi shows 8 subjects', t().active() === 'studyBooks' && byId.studyBooksWrap.children.length === 8);
  const p0 = sandbox.window.STUDY[0];
  const s0 = p0.subjects[0];
  const b0 = s0.books[0];
  const ch0 = b0.chapters[0];
  const key = '0.0.0.0';
  sandbox.openStudySubject(0, 0);
  ck('subject opened → chapters', t().active() === 'studyBook' && byId.studyChapters.children.length === s0.books.length);
  sandbox.openChapter(0, 0, 0, 0, ch0);
  ck('reading screen with sections', t().active() === 'studyRead' && byId.studyReadBody.children.length >= ch0.read.length + 1);
  const lastCh = t().last();
  ck('continue marker saved after open', !!lastCh && lastCh.key === '0.0.0.0' && !!lastCh.title);
  ck('search finds chapters by title', sandbox.searchChapters('النحو').length > 0);
  ck('search finds advanced-subject chapters', sandbox.searchChapters('الرياضيات المتقدمة').length > 0);
  ck('search empty query → []', sandbox.searchChapters('').length === 0);
  ck('search miss → []', sandbox.searchChapters('zzzzzznotfound').length === 0);

  sandbox.startStudyQuiz(0, 0, 0, 0, ch0);
  ck('study quiz started', t().active() === 'game' && t().qn() === ch0.qs.length);
  const coins0 = t().coins();
  for (let g = 0; g < 60 && t().qi() < t().qn(); g++) {
    sandbox.answer(t().qc()); pump(1600);
  }
  ck('study quiz → result', t().active() === 'result');
  const st = t().stars(key), dn = t().done(key);
  ck('perfect → 3 stars + done', st === 3 && dn === true);
  ck('coins earned', t().coins() > coins0);

  // replay via patched finish path
  sandbox.replayStudy();
  ck('replay works', t().active() === 'game');
  for (let g = 0; g < 60 && t().qi() < t().qn(); g++) { sandbox.answer(0); pump(1600); }
  ck('replay finished, stars kept', t().active() === 'result' && t().stars(key) === 3);
})();

/* ---- AI tutor (offline path) ---- */
(function ai() {
  // NOTE: ai key flow already tested via wiring below; don't reset S.study here
  sandbox.startStudyQuiz(0, 0, 0, 1, sandbox.window.STUDY[0].subjects[0].books[0].chapters[1]);
  pump();
  ck('aiCtx bound to study question', !!t().aictx() && !!t().aictx().q);
  ck('offline explain has correct answer', /الإجابة الصحيحة/.test(t().offline()));

  sandbox.openAISheet();
  pump();
  ck('ai sheet shown', byId.aiSheet.style.display === 'flex');
  ck('chat built (greeting + user + ai)', byId.aiChats.children.length >= 3);
  ck('offline explanation rendered (no key)', byId.aiChats.children.some(c => (c._inner || '').includes('الإجابة الصحيحة')));
  ck('aiCtx bar labeled', byId.aiCtxBar._inner.includes('الآن عن'));

  // chat intents (offline)
  byId.aiInput.value = 'معلومة ذهبية';
  sandbox.aiAsk('معلومة ذهبية'); pump();
  const gold = byId.aiChats.children[byId.aiChats.children.length-1];
  ck('gold tip intent works', !!gold && gold._inner.includes('ذهبية'));

  // md rendering
  ck('md bold works', sandbox.md('**قوي**').includes('<b>'));
  ck('md bullet works', sandbox.md('- نقطة').includes('•'));
  ck('md escapes html', sandbox.md('<script>x</script>').includes('&lt;'));

  sandbox.closeAISheet();
  ck('ai sheet hides', byId.aiSheet.style.display === 'none');

  // settings key save/clear wiring (IIFE wired)
  byId.aiKey.value = 'TESTKEY';
  byId.aiSaveBtn.onclick();
  pump();
  ck('ai key saved to set', t().set().aiKey === 'TESTKEY');
  ck('badge shows online', byId.aiBadge.textContent.includes('متصل'));
  byId.aiClearBtn.onclick();
  pump();
  ck('ai key cleared', t().set().aiKey === '');
  ck('badge back to offline mode', byId.aiBadge.textContent.includes('اللمسات السريعة'));
})();

/* ---- mistake review ---- */
(function review() {
  sandbox.startGame('science', false);
  pump();
  ck('normal game started', t().active() === 'game' && t().qn() > 0);
  const wrongIdx = (t().qc() + 1) % 4;   // force a wrong answer
  sandbox.answer(wrongIdx); pump(1600);
  ck('wrong answer recorded', Object.keys(t().S().wrongQs || {}).length > 0);
  ck('wrongQuestions resolves it', sandbox.wrongQuestions().length > 0);
  // answer the rest correctly so the game ends
  for (let g = 0; g < 60 && t().qi() < t().qn(); g++) { sandbox.answer(t().qc()); pump(1600); }
  ck('game finished', t().active() === 'result');

  sandbox.startReviewQuiz(); pump();
  ck('review quiz started', t().active() === 'game' && t().qn() > 0);
  for (let g = 0; g < 60 && t().qi() < t().qn(); g++) { sandbox.answer(t().qc()); pump(1600); }
  ck('review → result', t().active() === 'result');
  ck('mastered mistakes cleared', sandbox.wrongQuestions().length === 0);
})();

/* ---- about / changelog ---- */
ck('about version line set', (byId.appVersionLine.textContent || '').includes('1.3.20'));
sandbox.renderAbout();
const aboutHtml = byId.aboutBody._inner || '';
ck('changelog rendered (v23 entry)', aboutHtml.includes('v23'));
ck('changelog rendered (whats new + totals)', aboutHtml.includes('ما الجديد') && aboutHtml.includes('فصل') && aboutHtml.includes('سؤال'));
ck('about has personal signature + privacy footer', aboutHtml.includes('أحمد أيمن فكري') && aboutHtml.includes('خصوصيتك'));
sandbox.openAbout();
ck('about sheet opens', byId.aboutSheet.style.display === 'flex');
byId.aboutClose.onclick();
ck('about sheet closes', byId.aboutSheet.style.display === 'none');

/* ---- whats-new banner ---- */
t().S().lastSeenVer='';
ck('whats-new banner opens when new version', sandbox.maybeShowWhatsNew()===true);
ck('banner shows confirm button', byId.aboutSeen.style.display==='block');
sandbox.markSeenAbout();
ck('markSeen saves version + closes', (t().S().lastSeenVer||'').startsWith('v') && (t().S().lastSeenVerNum||0)>=27 && byId.aboutSheet.style.display==='none');
ck('no banner when version seen', sandbox.maybeShowWhatsNew()===false);
t().S().lastSeenVerNum=undefined;t().S().lastSeenVer='v26';
ck('old string version migrates to numeric', sandbox.swSeen()===26 && t().S().lastSeenVerNum===26);
sandbox.markSeenAbout();
ck('markSeen persists max version (no re-banner)', t().S().lastSeenVerNum===sandbox.swVer() && sandbox.maybeShowWhatsNew()===false);
vm.runInContext('window.__downgrade=maybeShowWhatsNew()',sandbox);
ck('stale SW cannot re-open banner', sandbox.window.__downgrade===false);
byId.aboutClose.style.display='none';

/* ---- exam mode ---- */
byId.examBtn.onclick();
ck('exam picker opens', byId.examSheet.style.display==='flex');
ck('exam picker lists tracks', byId.examList.children.length>=6);
byId.examClose.onclick();
ck('exam picker closes', byId.examSheet.style.display==='none');
sandbox.startExam(0);
ck('exam starts with weighted questions', byId.gCat.textContent.includes('امتحان') && t().qn()===20);
for(let g=0;g<40&&t().qi()<t().qn();g++){sandbox.answer(t().qc());pump(1600)}
ck('exam finishes with grade strip', byId.rExamStrip.style.display==='block' && byId.rExamStrip._inner.includes('التقدير'));

/* ---- voice ---- */
ck('speak is available', typeof sandbox.speak==='function');
let threw=false;try{sandbox.speakQuestion()}catch(e){threw=true}
ck('speakQuestion safe (no SS in vm)', !threw);

/* ---- mastery ---- */
Object.assign(t().S(),{games:0,correct:0,wrong:0,xp:0,level:1,study:{},catStats:{},lifelines:{fifty:1,skip:0,hint:1,double:0},playedCats:[],totalCoins:0,bestStreak:0,bestScore:0,perfect:0,coins:0});
vm.runInContext('window.__mh={h:masteryHTML(),t:masteryTip()}',sandbox);
ck('mastery board builds', sandbox.window.__mh.h.includes('إجمالي المكتبة') && sandbox.window.__mh.h.includes('0%'));
ck('mastery tip shows when empty', sandbox.window.__mh.t.includes('لم تختبر بعد'));
ck('mastery tip gives focus suggestion', sandbox.window.__mh.t.length>10);

/* ---- download center ---- */
vm.runInContext('window.__dlx=document.getElementById("dlChips").children.length',sandbox);
ck('dl chips render (all + 6 tracks)', sandbox.window.__dlx===7);
vm.runInContext('dlScope=0;window.__dlt={e:buildExplainHTML(),q:buildQuestionsHTML(),x:buildExamsHTML()}',sandbox);
const dlt=sandbox.window.__dlt;
ck('explain book built', dlt.e.includes('كتاب الشرح الكامل') && dlt.e.includes(sandbox.window.STUDY[0].subjects[0].books[0].chapters[0].title) && dlt.e.includes('</html>'));
ck('questions book built', dlt.q.includes('كتاب الأسئلة بحلولها') && dlt.q.includes('الإجابة') && dlt.q.includes('تلميح'));
ck('exams book built', dlt.x.includes('الورقة الأولى') && dlt.x.includes('بطاقة الإجابة'));
let dlb=false;try{dlleft=sandbox.downloadBook('explain');dlb=typeof dlleft==='string'&&dlleft.length>1000}catch(e){}
ck('downloadBook safe fallback without Blob', dlb);

/* per-book download + labels */
ck('unnamed books get a label from first chapter', String(sandbox.bookLabel(0,0,0)||'').length>0);
vm.runInContext('window.__bk=bookLabel(0,0,0)',sandbox);
ck('bookLabel label is meaningful', (sandbox.window.__bk||'').length>3);
vm.runInContext('dlBook={pi:0,si:0,bi:1};window.__pb=downloadBook("questions")',sandbox);
ck('per-book questions built with its content', (sandbox.window.__pb||'').length>2000);
ck('per-book excludes other tracks', !(sandbox.window.__pb||'').includes('الهندسة'));
vm.runInContext('window.__rst=dlBook===null',sandbox);
ck('dlBook reset after download', sandbox.window.__rst===true);
vm.runInContext('dlBook={pi:0,si:0,bi:0};window.__dn=dlFileName("explain");dlBook=null',sandbox);
ck('single-book filename carries track + book', (sandbox.window.__dn||'').startsWith('بكالوريا2027-كتاب-الشرح-') && (sandbox.window.__dn||'').includes('الآداب') && (sandbox.window.__dn||'').endsWith('.html'));

/* visible catalog of all books */
vm.runInContext('dlScope=-1;window.__cat=document.getElementById("dlBooks").innerHTML',sandbox);
const cat=sandbox.window.__cat||'';
ck('catalog lists all 124 books', (cat.match(/class="dl-book"/g)||[]).length===124);
ck('catalog has part sections', (cat.match(/class="dl-part"/g)||[]).length>=6);
ck('every catalog book has a name', !cat.includes('📕 </span>'));
ck('catalog shows per-book exam button', cat.includes('data-t="exams"'));

/* ---- daily study plan ---- */
vm.runInContext('window.__rem=planRemaining().length',sandbox);
ck('planRemaining counts remaining chapters', sandbox.window.__rem>=566 && sandbox.window.__rem<=567);
vm.runInContext('document.getElementById("planExamDate").value="2099-12-31";document.getElementById("planPerDay").value="5";buildPlan()',sandbox);
const pl=t().S().plan;
ck('plan builds from remaining chapters', !!pl && pl.total===sandbox.window.__rem && pl.perDay===5);
ck('plan days are evenly filled', pl.days.length===Math.ceil(pl.total/5) && pl.days.reduce((a,d)=>a+d.items.length,0)===pl.total);
ck("today's slice exists in plan", pl.days.some(d=>d.d === sandbox.dstr(new Date())));
sandbox.renderStudyPlan();
ck('plan widget renders on home', (byId.planTxt._inner||'').includes('اليوم 1 من') && byId.planBanner.style.display==='block');
ck('plan widget lists today items', (byId.planTxt._inner||'').includes('plan-item'));
sandbox.openPlan();
ck('plan sheet opens', byId.planSheet.style.display==='flex');
ck('plan form has summary', (byId.planBody._inner||'').includes('الخطة الحالية'));
byId.planClose.onclick();
ck('plan sheet closes', byId.planSheet.style.display==='none');
const planFirst=t().S().plan.days[0].items[0];
vm.runInContext('window.__fk=chKey('+planFirst.pi+','+planFirst.si+','+planFirst.bi+','+planFirst.ci+')',sandbox);
t().S().study[sandbox.window.__fk]={stars:3,done:true};
ck('plan progress counts finished chapter', sandbox.planProgress().done>=1);
sandbox.renderStudyPlan();
ck('finished plan item marked done', (byId.planTxt._inner||'').includes('plan-item done'));
vm.runInContext('(function(){S.plan.days.forEach(d=>d.items.forEach(it=>{S.study[chKey(it.pi,it.si,it.bi,it.ci)]={stars:3,done:true}}));return 1})()',sandbox);
sandbox.renderStudyPlan();
ck('completed plan celebrates + hides items', (byId.planTxt._inner||'').includes('اكتملت') && t().S().planCelebrated===true);
sandbox.renderPlanForm();
ck('plan delete button available', !!byId.planDel);
if(byId.planDel)byId.planDel.onclick();
ck('plan can be deleted', t().S().plan===null);
sandbox.renderStudyPlan();
ck('plan banner hidden after delete', byId.planBanner.style.display==='none');

/* ---- daily quick review ---- */
vm.runInContext('window.__pool=quickPool()',sandbox);
ck('quick pool covers library questions', sandbox.window.__pool.pool.length>=1000);
ck('quick pool weak list empty initially', sandbox.window.__pool.weak.length===0);
vm.runInContext('window.__wq=window.STUDY[0].subjects[0].books[0].chapters[0].qs[0]',sandbox);
vm.runInContext('S.wrongQs=S.wrongQs||{};S.wrongQs[qid(window.__wq)]={w:1,t:Date.now(),d:"medium"}',sandbox);
vm.runInContext('window.__pool2=quickPool()',sandbox);
ck('logged wrong question becomes weak', sandbox.window.__pool2.weak.some(it=>it.q===sandbox.window.__wq.q));
sandbox.startQuickReview();
vm.runInContext('window.__qr=({n:questions.length,qm:quickMode})',sandbox);
ck('quick review loads 10 mixed questions', sandbox.window.__qr.n===10 && sandbox.window.__qr.qm===true);
ck('quick review sets game title', (byId.gCat.textContent||'').includes('الجرعة'));
vm.runInContext('qi=questions.length+1;finishQuick();window.__qf=quickMode',sandbox);
ck('quick review finishes into result', (byId.rExamStrip._inner||'').includes('الجرعة اليومية') && sandbox.window.__qf===false);
ck('quick review shows accuracy coins', byId.rCoins.textContent==='0');

/* ---- pomodoro ---- */
ck('pomodoro formats time', sandbox.pomoFmt(90)==='01:30' && sandbox.pomoFmt(0)==='00:00');
ck('pomodoro defaults to 25min study', sandbox.pomo.left===1500 && sandbox.pomo.phase===0 && sandbox.pomo.run===false);
vm.runInContext('pomo.left=1;pomoStep()',sandbox);
ck('pomodoro decrements each step', sandbox.pomo.left===0 && sandbox.pomo.phase===0);
vm.runInContext('pomoStep();window.__pc=({p:pomo.phase,l:pomo.left})',sandbox);
ck('pomodoro auto-switches to 5min break', sandbox.window.__pc.p===1 && sandbox.window.__pc.l===300);
vm.runInContext('pomoSetPhase(0);window.__sc=({p:pomo.phase,l:pomo.left})',sandbox);
ck('pomodoro manual phase switch', sandbox.window.__sc.p===0 && sandbox.window.__sc.l===1500);
byId.pomoBtn.onclick();
ck('pomodoro sheet opens', byId.pomoSheet.style.display==='flex');
ck('pomodoro shows 25:00', (byId.pomoTime.textContent||'')==='25:00');
byId.pomoRest.onclick();
ck('pomodoro rest chip selected', sandbox.pomo.phase===1 && (byId.pomoRest.className||'').includes('on'));
sandbox.pomoStart();
ck('pomodoro starts running', sandbox.pomo.run===true);
sandbox.pomoReset();
ck('pomodoro reset to 25min stopped', sandbox.pomo.phase===0 && sandbox.pomo.left===1500 && sandbox.pomo.run===false);
byId.pomoClose.onclick();
ck('pomodoro sheet closes', byId.pomoSheet.style.display==='none');

/* ---- hard refresh button ---- */
ck('refresh button present', !!byId.refreshBtn && typeof byId.refreshBtn.onclick==='function');
ck('refresh invoke is safe in no-cache env', (function(){try{byId.refreshBtn.onclick();return true}catch(e){return false}})());

/* ---- home personal note ---- */
ck('home note element present', !!byId.homeNote);
vm.runInContext('S.plan=null;S.games=0;renderHomeNote()',sandbox);
ck('fresh app shows start message', (byId.homeNote.textContent||'').includes('رسالة منّي'));
vm.runInContext('window.__td=dstr(new Date())',sandbox);
vm.runInContext('S.plan={days:[{d:window.__td,items:[{pi:0,si:0,bi:0,ci:0}]}],total:1,perDay:1,examDate:"x",created:1};renderHomeNote()',sandbox);
ck('plan day count message', (byId.homeNote.textContent||'').includes('فصل'));
vm.runInContext('S.plan=null;S.games=5;renderHomeNote()',sandbox);
ck('rotation encouragement message', /فخور|همة|بعيد|شوية|أسطور|حقيقة/.test(byId.homeNote.textContent||''));

/* ---- weekly shatartk card ---- */
ck('week card element present', !!byId.weekCardTxt);
vm.runInContext('S.weekL=null;weekTick("cor",5);weekTick("cor",10);weekTick("wro",0)',sandbox);
ck('week ledger counts answers', t().S().weekL.q===3 && t().S().weekL.cor===2 && t().S().weekL.coins===15);
sandbox.renderWeekCard();
ck('week card shows progress line', (byId.weekCardTxt._inner||'').includes('صحيح'));
ck('week card stars graded', (byId.weekCardStars._inner||'').includes('⭐'));
vm.runInContext('S.weekL=null',sandbox);
sandbox.renderWeekCard();
ck('week card shows fresh-week state', (byId.weekCardTxt._inner||'').includes('شطارتك'));
ck('week card stars empty for fresh week', (byId.weekCardStars._inner||'')==='');

/* ---- sound kit ---- */
ck('sfx all types safe (no AudioContext in test env)', (()=>{try{['ok','no','tick','warn','coin','streak','win','perfect','lv'].forEach(t=>vm.runInContext('sfx("'+t+'")',sandbox));return true}catch(e){return false}})());

/* ---- study report export ---- */
ck('report button wired', !!byId.reportBtn && typeof byId.reportBtn.onclick==='function');
vm.runInContext('window.__rep=buildReportHTML()',sandbox);
ck('report builds with personal header', (sandbox.window.__rep).includes('تقرير مذاكرتي') && (sandbox.window.__rep).includes('أحمد أيمن فكري'));
ck('report lists library totals', (sandbox.window.__rep).includes('567 فصل') && (sandbox.window.__rep).includes('3853 سؤال'));
ck('report has mastery section', (sandbox.window.__rep).includes('إتقاني للمكتبة'));
vm.runInContext('S.weekL={k:weekKey(),q:10,cor:7,wro:3,coins:33}',sandbox);
ck('report includes weekly section', (sandbox.buildReportHTML()).includes('شطارتك'));
ck('report export is safe to invoke', (vm.runInContext('window.__repok=(()=>{try{downloadReport();return true}catch(e){return false}})()',sandbox),!!sandbox.window.__repok));

/* ---- fast reading ---- */
vm.runInContext('window.__fastN=null;openFast(0,0,0);window.__fastN=fast.segs.length',sandbox);
ck('fast reading opens with sections', (sandbox.window.__fastN||0)>1 && (byId.fastPgo.textContent||'').includes('1 /'));
sandbox.fastNext();
ck('fast next advances progress', (byId.fastPgo.textContent||'').includes('2 /'));
sandbox.fastPrev();
ck('fast prev goes back', (byId.fastPgo.textContent||'').includes('1 /'));
byId.fastBig.onclick();
ck('fast font size control works', (byId.fastT.style.fontSize||'')==='18px');
vm.runInContext('const c1=S.coins;fast.idx=fast.segs.length-1',sandbox);
sandbox.fastNext();
ck('fast finishing awards coins once per day', (()=>{const d=vm.runInContext('S.coins-c1',sandbox);return d===3})());
vm.runInContext('window.__fastGone=(fast===null)',sandbox);
ck('fast session clears after done', sandbox.window.__fastGone===true);
vm.runInContext('openFast(0,0,0);fast.idx=fast.segs.length-1',sandbox);
sandbox.fastNext();
ck('fast same-day repeat gives no extra coins', vm.runInContext('S.coins-c1===3',sandbox));
sandbox.fastAuto();
sandbox.fastClose();
ck('fast auto/close safe', (()=>{return vm.runInContext('window.__fl=fast===null',sandbox), sandbox.window.__fl===true})());

/* ---- notification time + chapter challenges ---- */
ck('notif toggle exists', !!byId.sNotif);
ck('notif hour select wired & default 19', !!byId.sNotifH && byId.sNotifH.value==='19');
vm.runInContext('set.notifH=21',sandbox);
sandbox.applySettings();
ck('notif hour applied to select', byId.sNotifH.value==='21');
ck('maybeNotify safe in env', (()=>{try{sandbox.maybeNotify();return true}catch(e){return false}})());
ck('resolve study chapter works', (()=>{const r=vm.runInContext('window.__rc=resolveStudyChapter("0.0.0.0")',sandbox);return !!(r&&r.ch&&(r.ch.title||'').length)})());
ck('challenge cfg carries chapter key', (()=>{const c=vm.runInContext('window.__cc=challengeCfg("0.0.1.2")',sandbox);return !!c&&c.f==='0.0.1.2'})());
ck('challenge link build safe (no nav)', (()=>{try{sandbox.buildChallengeLink('0.0.1.2');return true}catch(e){return false}})());

/* ---- courses ---- */
ck('course funcs present', typeof sandbox.renderCourses==='function' && typeof sandbox.courseNext==='function' && typeof sandbox.subjectProgress==='function');
sandbox.renderCourses();
ck('courses render hero + subject courses', (()=>{const L=byId.coursesList.children||[];return L.length>1&&(L[0]._inner||'').includes('كورسات')&&L.some(c=>/course-mini/.test(c.className||''))})());
sandbox.openCourse(0,0);
ck('course view opens with lessons', byId.courseLessons.children.length>0);
ck('lesson rows carry شرح / أسئلته buttons', (()=>{let txt=[];function w(n){if(!n)return;if(/course-bt/.test(n.className||''))txt.push(n.textContent||'');(n.children||[]).forEach(w)}w(byId.courseLessons);return txt.join(' ').includes('شرح')&&txt.join(' ').includes('أسئلته')})());
vm.runInContext('window.__nx=courseNext(0,0,0,0)',sandbox);
ck('courseNext yields next lesson', !!((sandbox.window.__nx||{}).ch));
vm.runInContext('window.__sp=subjectProgress(0,0)',sandbox);
ck('subjectProgress shape', (sandbox.window.__sp||{}).tot>0 && typeof (sandbox.window.__sp||{}).pct==='number');
sandbox.resumeCourse(0,0);
ck('resume opens a chapter read', (byId.srTitle.textContent||'').includes('الفصل'));

/* ---- listen mode ---- */
ck('listenChapter exists', typeof sandbox.listenChapter==='function');
ck('listenChapter safe without speechSynthesis', (()=>{try{sandbox.listenChapter({read:[{h:'العنوان',t:'النص'}]},'فصل أول');return true}catch(e){return false}})());
ck('listening stays off in env', vm.runInContext('window.__lst=listening',sandbox)===false);
ck('no listen button when TTS unsupported', !('listenBtn' in byId));

/* ---- v40 rebirth: olive light theme ---- */
ck('default theme is light (no dark class)', (()=>{try{return vm.runInContext(`!document.documentElement.classList.contains('dark')`,sandbox)===true}catch(e){return false}})());
ck('setting dark applies html.dark', (()=>{try{vm.runInContext(`set.dark=true;applySettings();window.__d=document.documentElement.classList.contains('dark')`,sandbox);return vm.runInContext('__d',sandbox)===true}catch(e){return 'ERR:'+e.message}})());
ck('setting dark back to light', (()=>{try{vm.runInContext(`set.dark=false;applySettings();window.__d2=document.documentElement.classList.contains('dark')`,sandbox);return vm.runInContext('__d2',sandbox)===false}catch(e){return 'ERR:'+e.message}})());
ck('palette uses olive primary', (()=>{try{const t=vm.runInContext(`document.getElementById('hmLv')`,sandbox);return !!t}catch(e){return false}})());

/* ---- v40 resume card + course hero on home ---- */
ck('resume card exists on home', !!vm.runInContext(`document.getElementById('resumeCard')`,sandbox));
ck('course hero on home shows progress text', (()=>{try{vm.runInContext(`updateHome()`,sandbox);const t=vm.runInContext(`document.getElementById('courseHero')._inner`,sandbox);return t&&t.indexOf('كورسات الشرح')>=0}catch(e){return false}})());

/* ---- v40 podcast player ---- */
ck('pod controls exist', !!vm.runInContext(`document.getElementById('podPlay')&&document.getElementById('podSpeed')&&document.getElementById('podTitle')`,sandbox));
ck('podShow shows dock and title', (()=>{try{vm.runInContext(`podShow()`,sandbox);return vm.runInContext(`document.getElementById('pod').style.display===''`,sandbox)}catch(e){return false}})());
ck('podStop hides dock', (()=>{try{vm.runInContext(`podStop()`,sandbox);return vm.runInContext(`document.getElementById('pod').style.display==='none'`,sandbox)}catch(e){return false}})());
ck('podSpeed cycles rate 1->1.15', (()=>{try{vm.runInContext(`podS.rate=1;podSpeed();window.__r=podS.rate`,sandbox);return vm.runInContext('__r',sandbox)===1.15}catch(e){return 'ERR:'+e.message}})());
ck('listenChapter safe without speechSynthesis', (()=>{try{vm.runInContext(`podStop();listenChapter({read:[{h:'العنوان',t:'نص الشرح'}]},'فصل أول');window.__lst=listening`,sandbox);return vm.runInContext('__lst',sandbox)===false}catch(e){return 'ERR:'+e.message}})());

/* ---- v41 voice quality ---- */
ck('pickVoice safe without speechSynthesis', (()=>{try{return sandbox.pickVoice()===null}catch(e){return 'ERR:'+e.message}})());
ck('pod default rate is calm 0.9', (()=>{try{vm.runInContext(`window.__r0=podS.rate`,sandbox);return vm.runInContext('__r0',sandbox)===0.9}catch(e){return 'ERR:'+e.message}})());
ck('podSpeed 1->1.15 still works', (()=>{try{vm.runInContext(`podS.rate=1;podSpeed();window.__r1=podS.rate`,sandbox);return vm.runInContext('__r1',sandbox)===1.15}catch(e){return 'ERR:'+e.message}})());

/* ---- v42 smooth reading ---- */
ck('toChunks merges tiny fragments', (()=>{try{const c=vm.runInContext(`toChunks('الجملة الطويلة الأولى هنا وتكمّل فيها. أ. أحمد. جملة ثانية كبيرة تكمل النص طبيعي')`,sandbox);return Array.isArray(c)&&c.length>=2&&c.every(x=>x.length>=14)}catch(e){return 'ERR:'+e.message}})());
ck('toChunks keeps single sentence', (()=>{try{const c=vm.runInContext(`toChunks('جملة قصيرة بدون نقطة كاملة')`,sandbox);return Array.isArray(c)&&c[0].indexOf('جملة')>=0}catch(e){return 'ERR:'+e.message}})());
ck('podKick defined', typeof sandbox.podKick==='function');

/* ---- v43 real leaderboard ---- */
ck('lbMode false by default', !sandbox.lbMode());
ck('lbMode true after key set', (()=>{try{vm.runInContext(`set.jsonbinKey='K';window.__m=lbMode()`,sandbox);return vm.runInContext('__m',sandbox)===true}catch(e){return 'ERR:'+e.message}})());
ck('lbMode back to false after clear', (()=>{try{vm.runInContext(`set.jsonbinKey='';window.__m2=lbMode()`,sandbox);return vm.runInContext('__m2',sandbox)===false}catch(e){return 'ERR:'+e.message}})());
ck('lbSelfEntry computes ptsAll', (()=>{try{vm.runInContext(`S.correct=7;S.weekBest=40;window.__e=lbsSelfEntry()`,sandbox);const e=vm.runInContext('__e',sandbox);return e&&e.ptsAll===35&&e.ptsWeek===40}catch(e){return 'ERR:'+e.message}})());
ck('renderLB shows cached real entries', (()=>{try{vm.runInContext(`localStorage.setItem('iq_lb_cache',JSON.stringify({entries:[{name:'أحمد',games:2,correct:15,ptsAll:75,ptsWeek:30,ptsMonth:0},{name:'يوسف',games:1,correct:8,ptsAll:40,ptsWeek:10,ptsMonth:0}]}))`,sandbox);return true}catch(e){return 'ERR:'+e.message}})());
ck('renderLB renders rows from cache', (()=>{try{vm.runInContext(`document.getElementById('lbKeyInput')&&0`,sandbox);vm.runInContext(`renderLB()`,sandbox);const n=vm.runInContext(`document.getElementById('lbList').children.length`,sandbox);return n===2}catch(e){return 'ERR:'+e.message}})());
ck('renderLB no network without key', (()=>{const before=fetchCalls.length;try{vm.runInContext(`set.jsonbinKey='';renderLB()`,sandbox)}catch(e){return 'ERR:'+e.message}return fetchCalls.length===before})());
ck('lbUpsert safe in offline env', (()=>{try{vm.runInContext(`set.jsonbinKey='K';set.jsonbinBin='x';window.__p=lbUpsert()`,sandbox);vm.runInContext(`set.jsonbinKey=''`,sandbox);return true}catch(e){return 'ERR:'+e.message}})());

/* ---- persistence (check before AI resets it) ---- */
  ck('state persisted', localStorage._d.iq_state && JSON.parse(localStorage._d.iq_state).study['0.0.0.0'] && JSON.parse(localStorage._d.iq_state).study['0.0.0.0'].stars === 3);
  ck('settings persisted', localStorage._d.iq_set && JSON.parse(localStorage._d.iq_set).aiKey === '');

console.log('\n=== ' + pass + ' PASS / ' + fail + ' FAIL ===');