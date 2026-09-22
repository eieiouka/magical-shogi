# magical-shogi

「魔法少女ノ魔法将棋」のユーザー向けReact/Viteプロジェクトです。

## 起動

```powershell
npm install
npm run dev
```

## ビルド

```powershell
npm run build
```

## Fairy-Stockfish AI

Fairy-Stockfishのブラウザ版を生成するには、Emscripten SDKをactivateし、GNU makeを
PATHへ追加したPowerShellで次を一度実行します。

```powershell
npm run build:fairy
npm run build
```

生成される`public/fairy/stockfish.js`、`stockfish.wasm`、`stockfish.worker.js`をGitへ
追加してVercelへpushしてください。未生成の場合は従来AIへ自動的に戻るため、UI開発は
そのまま続けられます。詳しい内部構成は`ENGINE_ARCHITECTURE_JA.md`を参照してください。

## 駒画像

`public/images/pieces/`へ次のPNG画像を配置してください。

- `nanoka_black.png` / `nanoka_red.png`
- `hanna_black.png` / `hanna_red.png`
- `hiro_black.png` / `hiro_red.png`
- `ema_black.png` / `ema_red.png`
- `sherry_black.png` / `sherry_red.png`
- `margo_black.png` / `margo_red.png`

黒が通常、赤が魔女化です。エマには魔女化がありませんが、参照互換性のため両方置いても問題ありません。
