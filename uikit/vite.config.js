import { defineConfig } from 'vite';

// Cloudflare Workers の /uikit/ 以下で配信する。
// 出力はリポジトリ直下の dist/uikit/ に置き、dist/ をまとめて Workers の静的アセットとして配信する
export default defineConfig({
  base: '/uikit/',
  build: {
    outDir: '../dist/uikit',
    emptyOutDir: true,
  },
});
