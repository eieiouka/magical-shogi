Fairy-Stockfish Emscripten 6 same-script pthread fix v14

Emscripten 6 uses stockfish.js itself as the pthread worker. This build embeds
worker-postamble.js into stockfish.js with --post-js.

Extract into C:\Users\oka06\magical-shogi and overwrite files.

Get-ChildItem .\fairy-stockfish-wasm\src -Recurse -File |
  Where-Object { $_.Extension -in '.o','.d' } |
  Remove-Item -Force

npm run build:fairy
npm run dev -- --force
