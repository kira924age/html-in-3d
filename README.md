# html-in-3d

three.js の3D空間にHTML（またはHTMLのようなUI）を表示する方法のデモ集です。

| ディレクトリ | 方法 |
|---|---|
| [`uikit/`](uikit/) | [@pmndrs/uikit](https://github.com/pmndrs/uikit) でUIをWebGLのメッシュとして直接描く（[デモ](https://html-in-3d.kira924age.workers.dev/uikit/)） |

## デプロイ

Cloudflare Workers の静的アセットとして配信しています（Worker のコードはなく、`dist/` をそのまま配信）。
各デモは `dist/<ディレクトリ名>/` にビルドされ、`https://html-in-3d.kira924age.workers.dev/<ディレクトリ名>/` になります。

```bash
npm install
npm --prefix uikit install
npm run deploy   # ビルドして wrangler deploy
```
