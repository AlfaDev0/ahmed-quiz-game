const fs = require('fs');
const os = require('os');
const path = '/home/kali/ahmed-quiz-game';

let src = fs.readFileSync(path + '/study.js', 'utf8');
if (!src.includes('window.STUDY = ')) { console.log('ERR: STUDY not found'); process.exit(1); }

const exts = process.argv.slice(2);
if (!exts.length) { console.log('no ext files'); process.exit(0); }

let arr = null;
for (const ef of exts) {
  const code = fs.readFileSync(path + '/' + ef, 'utf8');
  const ctx = {};
  vm = require('vm');
  ctx.window = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const entries = ctx.window.STUDY_EXT || ctx.STUDY_EXT;
  if (!entries) { console.log('ERR: ' + ef + ' has no STUDY_EXT'); process.exit(1); }
  for (const en of entries) {
    if (!en.partId || !en.subjectId) { console.log('ERR: bad entry in ' + ef); process.exit(1); }
    // find part by id and position
    const m = src.match(/window\.STUDY = (\[[\s\S]*\];?)\s*$/);
    if (!m) { console.log('ERR: cannot locate array'); process.exit(1); }
    arr = JSON.parse(m[1].replace(/;\s*$/, ''));
    const pi = arr.findIndex(p => p.id === en.partId);
    if (pi < 0) { console.log('ERR: part not found ' + en.partId); process.exit(1); }
    const si = arr[pi].subjects.findIndex(s => s.id === en.subjectId);
    if (si < 0) {
      arr[pi].subjects.push(en.subject);
      console.log('+ created subject ' + en.subjectId + ' in ' + en.partId);
    } else {
      const subj = arr[pi].subjects[si];
      const have = new Set(subj.books.map(b => b.title));
      let added = 0;
      for (const b of en.subject.books) {
        if (!have.has(b.title)) { subj.books.push(b); have.add(b.title); added++; }
        else console.log('  skip dup book: ' + b.title);
      }
      console.log('+ ' + added + ' book(s) added to subject ' + en.subjectId + ' (' + subj.name + ') in ' + en.partId);
    }
  }
  src = '/* تحدي الذكاء — المكتبة التعليمية الكاملة\n   ثالثة ثانوي عام (أدبي + علمي علوم + علمي رياضة) + أزهرية — دروس المنهج الرسمي\n*/\nwindow.STUDY = ' + JSON.stringify(arr) + ';';
}

// optional syntax check after merge happens here
fs.writeFileSync(path + '/study.js', src);
console.log('merged OK → ' + exts.join(', '));

// quick count
let _window = {};
global.window = _window;
eval(src);
let ch = 0, q = 0;
_window.STUDY.forEach(p => p.subjects.forEach(s => s.books.forEach(b => b.chapters.forEach(c => { ch++; q += c.qs.length; }))));
console.log('parts=' + _window.STUDY.length + ' chapters=' + ch + ' questions=' + q);