const fs=require('fs');
const html=fs.readFileSync('/home/kali/ahmed-quiz-game/index.html','utf8');
const questions=fs.readFileSync('/home/kali/ahmed-quiz-game/questions.js','utf8');
const study=fs.readFileSync('/home/kali/ahmed-quiz-game/study.js','utf8');

// v72: نضمّن الصور جوّه الملف — كانت بتظهر مكسورة في النسخة المحمّلة
const b64=(p)=>fs.readFileSync(p).toString('base64');
const IMG={
  'icons/avatar.jpg':'data:image/jpeg;base64,'+b64('/home/kali/ahmed-quiz-game/icons/avatar.jpg'),
  'icons/icon-192.png':'data:image/png;base64,'+b64('/home/kali/ahmed-quiz-game/icons/icon-192.png'),
  'icons/icon-512.png':'data:image/png;base64,'+b64('/home/kali/ahmed-quiz-game/icons/icon-512.png')
};
const inlineImgs=(t)=>Object.keys(IMG).reduce((s,k)=>s.split(k).join(IMG[k]),t);
// أيقونة الملف نفسه (تظهر كصورة التبويب في الموبايل)
const APP_ICON='data:image/png;base64,'+b64('/home/kali/ahmed-quiz-game/icons/icon-192.png');

// 1) extract <style> block
const style=(html.match(/<style>([\s\S]*?)<\/style>/))||[,''];
// 2) extract body markup (between </head> and first <script src)
const headEnd=html.indexOf('</head>');
const bodyStart=html.indexOf('<body>',headEnd)+'<body>'.length;
const firstScript=html.indexOf('<script src=',bodyStart);
const bodyMarkup=inlineImgs(html.slice(bodyStart,firstScript));
// 3) extract inline script blocks in order
// نقرأ البلوكات من بعد أول <script src> فقط — عشان ما نكرّرش بلوك جوّه bodyMarkup
const blocks=[];
const re=/<script(?![^>]*src)(?![^>]*text\/plain)[^>]*>([\s\S]*?)<\/script>/g;
let m;while((m=re.exec(html.slice(firstScript))))blocks.push(m[1]);
const esc=(s)=>s.replace(/<\/script>/gi,'<\\/script>');

const out=[
 '<!DOCTYPE html><html dir="rtl" lang="ar"><head>',
 '<meta charset="utf-8">',
 '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">',
 '<meta name="theme-color" content="#0b1020">',
 '<link rel="icon" href="'+APP_ICON+'">',
 '<title>تحدي الذكاء — أحمد أيمن فكري (نسخة تحميل)</title>',
 '<style>',style[1],'</style></head><body>',
 bodyMarkup,
 '<script>',esc(questions),'</script>',
 '<script>',esc(study),'</script>',
 ...blocks.map(b=>'<script>'+esc(inlineImgs(b))+'</script>'),
 '</body></html>'
].join('\n');

fs.mkdirSync('/home/kali/ahmed-quiz-game/download',{recursive:true});
fs.writeFileSync('/home/kali/ahmed-quiz-game/download/ahmed-quiz-offline.html',out);
console.log('built bytes:',out.length);
console.log('blocks:',blocks.length);
console.log('grep literal </script> inside blocks:', blocks.some(b=>/<\/script>/.test(b)));
const outCheck=out;
console.log('broken image refs left:', (outCheck.match(/icons\/(avatar|icon-192|icon-512)\.(jpg|png)/g)||[]).length);
