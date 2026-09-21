# Rust/WASM search engine

PowerShellでプロジェクト直下から実行:

```powershell
npm run build:wasm
npm run dev
```

生成物は `src/game/wasm/` に出力され、ViteがWorker用モジュールとしてまとめます。Web WorkerはWASMを優先し、初期化・実行失敗時だけJavaScript探索へ戻ります。
