このフォルダにはAI接続用の fairy-bridge.worker.js が入っています。

Fairy-Stockfish本体の次の3ファイルは、npm run build:fairy で生成されます。
  stockfish.js
  stockfish.wasm
  stockfish.worker.js

本体が未生成でもゲームは従来のRust/WASM AIへ自動フォールバックします。
