#!/usr/bin/env bash
# verify_live.sh — proof that the DEPLOYED site on GitHub Pages matches and works.
# 1) downloads the exact live files (cache-busted), 2) compares them to the local repo
#    build, 3) runs the full app_test.js harness against the LIVE files.
set -u
cd "$(dirname "$0")/.."
REPO_DIR="$(pwd)"
LIVE="https://alfadev0.github.io/ahmed-quiz-game"
WORK="$(mktemp -d /tmp/opencode/verify_live.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

echo "== downloading live files (cache-busted) =="
for f in index.html questions.js study.js sw.js; do
  curl -sf "$LIVE/$f?cb=$RANDOM" -o "$WORK/$f" || { echo "FAIL: could not download $f"; exit 1; }
done

echo "== md5 parity live vs repo =="
ok=1
for f in index.html questions.js study.js; do
  a=$(md5sum "$WORK/$f" | cut -d' ' -f1)
  b=$(md5sum "$REPO_DIR/$f" | cut -d' ' -f1)
  if [ "$a" == "$b" ]; then echo "  PASS  $f"; else echo "  DIFF  $f (live=$a repo=$b)"; ok=0; fi
done
swa=$(md5sum "$WORK/sw.js" | cut -d' ' -f1)
swb=$(md5sum "$REPO_DIR/sw.js" | cut -d' ' -f1)
echo "  live sw version: $(grep -o 'ahmed-quiz-v[0-9]*' "$WORK/sw.js" | head -1)"
echo "  repo sw version: $(grep -o 'ahmed-quiz-v[0-9]*' "$REPO_DIR/sw.js" | head -1)"
if [ "$swa" == "$swb" ]; then echo "  PASS  sw.js"; else echo "  DIFF  sw.js"; ok=0; fi
[ "$ok" == "0" ] && { echo "!! live is NOT the latest build — wait for CDN or re-push"; exit 2; }

echo "== study.js totals (live) =="
node -e "
const fs=require('fs');
const s=fs.readFileSync('$WORK/study.js','utf8');
const m=s.match(/window.STUDY=(\[.*\]);?\n?\$/s);
const d=JSON.parse(m?m[1]:s.slice(s.indexOf('['),s.lastIndexOf(']')+1));
let ch=0,qs=0;d.forEach(p=>p.subjects.forEach(x=>x.books.forEach(b=>{ch+=b.chapters.length;b.chapters.forEach(c=>qs+=c.qs.length)})));
console.log('  parts='+d.length+' chapters='+ch+' questions='+qs);
"

echo "== full harness on LIVE assets =="
TEST_INDEX="$WORK/index.html" TEST_QUESTIONS="$WORK/questions.js" TEST_STUDY="$WORK/study.js" \
  node tests/app_test.js 2>&1 | tail -4

echo "== done =="