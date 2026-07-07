# sukusukukiroku

授乳・成長記録アプリ（GitHub Pages で公開）。

- `index.html` / `css/style.css` / `js/app.js`: フロントエンド
- `js/data.js`: データ層。Google Apps Script + スプレッドシートと通信します
- `gas/`: Google Apps Script側のバックエンドコードとセットアップ手順（[gas/README.md](gas/README.md)）

夫婦でデータを共有するには、[gas/README.md](gas/README.md) の手順で GAS をデプロイし、
アプリの設定画面にウェブアプリURLを登録してください。
