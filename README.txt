Fairy-Stockfish Emscripten 6 end-to-end trace v18

Pthread output must be proxied to the parent Module. This version leaves
print/printErr undefined inside pthreads so Emscripten installs its standard
output proxy, while retaining the custom UCI input handler from v16.

Extract into C:\Users\oka06\magical-shogi and overwrite files.

Get-ChildItem .\fairy-stockfish-wasm\src -Recurse -File |
  Where-Object { $_.Extension -in '.o','.d' } |
  Remove-Item -Force

Remove-Item .\fairy-stockfish-wasm\src\stockfish.js, .\fairy-stockfish-wasm\src\stockfish.wasm, .\public\fairy\stockfish.js, .\public\fairy\stockfish.wasm -ErrorAction SilentlyContinue

npm run build:fairy
npm run dev -- --force
