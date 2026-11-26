// 可変フォントから、UIで使う文字だけを含む Regular / Bold のTTFを作る。
// 使い方: node scripts/build-fonts.mjs <MPLUS1Code[wght].ttf のパス>
//   元フォント: https://github.com/google/fonts/tree/main/ofl/mplus1code （SIL Open Font License 1.1）
//   必要なもの: python3 と fonttools（pip install fonttools）
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCharset } from '../src/strings.js';

const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/build-fonts.mjs <path/to/MPLUS1Code[wght].ttf>');
  process.exit(1);
}

const outDir = fileURLToPath(new URL('../public/fonts/', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'fonts-'));
const textFile = join(work, 'charset.txt');
writeFileSync(textFile, collectCharset());

for (const [name, weight] of [['Regular', 400], ['Bold', 700]]) {
  const instance = join(work, `${name}.ttf`);
  // 可変フォントから指定の太さの静的フォントを切り出す
  execFileSync('python3', ['-m', 'fontTools.varLib.instancer', source, `wght=${weight}`, '--update-name-table', '-o', instance], { stdio: 'inherit' });
  // 使う文字だけに絞る
  execFileSync('python3', ['-m', 'fontTools.subset', instance, `--text-file=${textFile}`, '--layout-features=*', `--output-file=${join(outDir, `MPLUS1Code-${name}.subset.ttf`)}`], { stdio: 'inherit' });
}
console.log(`wrote ${outDir} (${collectCharset().length} chars)`);
