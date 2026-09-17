const fs=require('fs');
const html=fs.readFileSync('/home/kali/ahmed-quiz-game/index.html','utf8');
const questions=fs.readFileSync('/home/kali/ahmed-quiz-game/questions.js','utf8');
const study=fs.readFileSync('/home/kali/ahmed-quiz-game/study.js','utf8');

// 1) extract <style> block
const style=(html.match(/<style>([\s\S]*?)<\/style>/))||[,''];
// 2) extract body markup (between </head> and first <script src)
const headEnd=html.indexOf('</head>');
const bodyStart=html.indexOf('<body>',headEnd)+'<body>'.length;
const firstScript=html.indexOf('<script src=',bodyStart);
const bodyMarkup=html.slice(bodyStart,firstScript);
// 3) extract inline script blocks in order
const blocks=[];
const re=/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g;
let m;while((m=re.exec(html)))blocks.push(m[1]);
const esc=(s)=>s.replace(/<\/script>/gi,'<\\/script>');

const out=[
'<!DOCTYPE html><html dir="rtl" lang="ar"><head>',
'<meta charset="utf-8">',
'<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">',
'<title>تحدي الذكاء — أحمد أيمن فكري (نسخة تحميل)</title>',
'<style>',style[1],'</style></head><body>',
bodyMarkup,
'<script>',esc(questions),'</script>',
'<script>',esc(study),'</script>',
...blocks.map(b=>'<script>'+esc(b)+'</script>'),
'</body></html>'
].join('\n');

fs.mkdirSync('/home/kali/ahmed-quiz-game/download',{recursive:true});
fs.writeFileSync('/home/kali/ahmed-quiz-game/download/ahmed-quiz-offline.html',out);
console.log('built bytes:',out.length);
console.log('blocks:',blocks.length);
console.log('grep literal </script> inside blocks:', blocks.some(b=>/<\/script>/.test(b)));
