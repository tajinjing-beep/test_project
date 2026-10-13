# Citation Formatter

URL を入力すると APA / MLA / Chicago / Harvard / IEEE / BibTeX の引用を生成する、Cloudflare Workers 製のツール。

- `src/index.js` — Worker。1時間キャッシュし、他サイトからの呼び出しは拒否。`/api/cite?url=` でページを取得し、`citation_*` / Dublin Core / OpenGraph / JSON-LD からメタデータを抽出。DOI は Crossref API で補完。
- `public/` — 静的フロントエンド(Workers Static Assets で配信)。`formatters.js` が書式変換の本体(APA / MLA / Chicago / Harvard / IEEE / 日本語 / BibTeX)、`app.js` が画面。複数 URL の一括取得、参考文献リスト(ブラウザに保存)、コピー(イタリック保持)、.txt / .bib 出力、ダーク表示に対応。
- `test/` — 書式変換のテスト (`npm test`)。

## 使い方

```sh
npm install
npm run dev      # ローカル起動 (http://localhost:8787)
npm run deploy   # Cloudflare にデプロイ (要 wrangler login)
```

自動抽出は完璧ではないため、画面上でメタデータを修正すると書式に即反映される。提出前に必ず目視確認すること。
