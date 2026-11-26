import { TTFLoader } from '@pmndrs/uikit';
import { collectCharset } from './strings.js';

// uikit の TTFLoader は、TTFから指定した文字だけを実行時にMSDF化する（WebAssembly、Worker上で処理）。
// 等幅のフォント（M PLUS 1 Code）を使い、ASCIIとターミナル用の記号（█░▁▂…）を charset に渡す。
// 1回の loadAsync に複数のフォントを渡すと1つのWorkerで順番に処理されるので、太さごとに呼んで並列に生成する
export async function loadMonoFont() {
  const charset = collectCharset();
  const options = { charset, fontSize: 48, textureSize: [512, 512] };
  const start = performance.now();
  const families = await Promise.all(
    ['Regular', 'Bold'].map((weight) => new TTFLoader().loadAsync({ url: `/fonts/MPLUS1Code-${weight}.subset.ttf`, ...options })),
  );
  // 返り値は { フォント名: { 太さ: フォントデータ } }。両方の太さを1つにまとめ、扱いやすい名前に付け替える
  const weights = Object.assign({}, ...families.flatMap((family) => Object.values(family)));
  const { common } = Object.values(weights)[0];
  return {
    fontFamilies: { mono: weights },
    stats: { chars: charset.length, ms: performance.now() - start, width: common.scaleW, height: common.scaleH },
  };
}
