# uikit

[@pmndrs/uikit](https://github.com/pmndrs/uikit) で three.js の3D空間にUIパネルを置くデモです（React Three Fiber は使わず、素の three.js）。

- ターミナル風のUIパネル2枚（`renderer.info` などの実測値、読み込んだGLBの中身、操作ボタン、コマンド入力）と、画面下のステータスバー
- 透明なGLB（`public/models/crystal.glb`）を置き、パネルとの前後関係が視点を回しても崩れないようにしている
- Orbit / First Person の視点切り替えと、WASD・矢印キー・画面のスティックでの移動（画面固定の操作部品は普通のHTML）

## 動かし方

```bash
npm install
npm run dev
```

http://localhost:5180/ を開きます。

## 構成

| ファイル | 内容 |
|---|---|
| `src/main.js` | シーン、GLBの読み込み、操作、描画ループ |
| `src/ui.js` | uikit のパネルとステータスバー |
| `src/strings.js` | UIの文言（フォントに含める文字もここから集める） |
| `src/fonts.js` | `TTFLoader` でフォントを実行時にMSDF化する |
| `src/metrics.js` | パネルに出す実測値の収集 |
| `src/navigation.js` | 視点移動（Orbit / First Person） |
| `src/overlay.js` | 視点切り替えボタンとスティック（HTML） |

## アセットの作り直し

```bash
# 透明なクリスタルのGLB（three.js の GLTFExporter で生成）
npm run generate:glb

# フォントのサブセット（strings.js の文言を変えたら作り直す）
# 元フォント: https://github.com/google/fonts/tree/main/ofl/mplus1code
# 必要なもの: python3 と fonttools
node scripts/build-fonts.mjs <path/to/MPLUS1Code[wght].ttf>
```

## 注意点

- uikit 1.x は WebGLRenderer 専用で、WebGPURenderer では使えません（[pmndrs/uikit#275](https://github.com/pmndrs/uikit/issues/275)）。
- uikit のパネルは深度を書き込まないため、奥の透明な物体が透けて見えないよう、各パネルの背後に不透明な板を置いています（`src/ui.js` の `rearPanel`）。

## ライセンス

フォント M PLUS 1 Code は SIL Open Font License 1.1 です（`public/fonts/OFL.txt`）。
