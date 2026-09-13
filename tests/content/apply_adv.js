const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const CONTENT = __dirname;

const ADV = [
  { part: 'ilmu_r', subj: { id: 'advmath', name: 'الرياضيات المتقدمة', icon: '📐', color: '#7C4DFF', books: require(path.join(CONTENT, 'adv_math.js')).books } },
  { part: 'ilmu_r', subj: { id: 'advphys', name: 'الفيزياء المتقدمة', icon: '🧲', color: '#00BCD4', books: require(path.join(CONTENT, 'adv_physics.js')).books } },
  { part: 'ilmu', subj: { id: 'advbio', name: 'الأحياء المتقدم', icon: '🧬', color: '#4CAF50', books: require(path.join(CONTENT, 'adv_biology.js')).books } },
  { part: 'ilmu', subj: { id: 'advchm', name: 'الكيمياء المتقدمة', icon: '⚗️', color: '#FF7043', books: require(path.join(CONTENT, 'adv_chemistry.js')).books } },
];

function loadStudy(f) {
  const src = fs.readFileSync(f, 'utf8');
  const m = src.match(/([\s\S]*?)window\.STUDY = (\[[\s\S]*?\];?)\s*$/);
  if (!m) { console.log('ERR: no window.STUDY'); process.exit(1); }
  return { header: m[1], arr: JSON.parse(m[2].replace(/;\s*$/, '')) };
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

const { header, arr } = loadStudy(path.join(ROOT, 'study.js'));
let added = 0;
ADV.forEach(({ part, subj }) => {
  const p = arr.find(x => x.id === part);
  if (!p) { console.log('ERR: part ' + part + ' not found'); process.exit(1); }
  if (p.subjects.some(s => s.id === subj.id)) { console.log('SKIP ' + subj.id + ' already in ' + part); return; }
  p.subjects.push(clone(subj));
  added++;
  console.log('# added ' + subj.name + ' → ' + part);
});

let parts = arr.length, eh = 0, q = 0, bad = 0, noExpl = 0;
arr.forEach(p => p.subjects.forEach(s => s.books.forEach(b => b.chapters.forEach(c => {
  c.qs.forEach(qq => {
    if (!qq.q || !Array.isArray(qq.a) || qq.a.length !== 4 || typeof qq.c !== 'number' || qq.c < 0 || qq.c > 3 || !qq.a[qq.c]) { bad++; console.log('BAD q: ' + qq.q); }
    if (!qq.d || !['easy', 'medium', 'hard'].includes(qq.d)) { bad++; console.log('NO d: ' + qq.q); }
    if (!qq.expl) noExpl++;
  });
  if (!c.title || !Array.isArray(c.read) || !c.read.length || !c.qs.length) { bad++; console.log('BAD ch: ' + c.title); }
  eh++; q += c.qs.length;
}))));
console.log('added=' + added + ' parts=' + parts + ' chapters=' + eh + ' questions=' + q + ' bad=' + bad + ' noExpl=' + noExpl);
if (bad) process.exit(1);

const headerNow = '/* تحدي الذكاء — المكتبة التعليمية الكاملة\n   ثالثة ثانوي بكالوريا 2027 (الآداب + الهندسة + الطب + الأعمال) + الأزهرية — دروس المنهج الرسمي\n*/\n';
fs.writeFileSync(path.join(ROOT, 'study.js'), headerNow + 'window.STUDY = ' + JSON.stringify(arr) + ';');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext('window.STUDY = ' + JSON.stringify(arr), ctx);
console.log('study.js written, vm OK: parts=' + ctx.window.STUDY.length);