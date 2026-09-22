Fairy-Stockfish Emscripten 6 pthread URL fix v21

This version fixes the actual pthread script URL. When stockfish.js is loaded by
importScripts, Emscripten otherwise mistakes fairy-bridge.worker.js for its own
pthread entry script. The bridge now explicitly points pthreads to stockfish.js.

Extract into C:\Users\oka06\magical-shogi and overwrite files.

Get-ChildItem .\fairy-stockfish-wasm\src -Recurse -File |
  Where-Object { $_.Extension -in '.o','.d' } |
  Remove-Item -Force

Remove-Item .\fairy-stockfish-wasm\src\stockfish.js, .\fairy-stockfish-wasm\src\stockfish.wasm, .\public\fairy\stockfish.js, .\public\fairy\stockfish.wasm -ErrorAction SilentlyContinue

npm run build:fairy
npm run dev -- --force
