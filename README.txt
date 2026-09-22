Fairy-Stockfish continuous minimum depth 15 v23

This version uses one continuous iterative-deepening search. It sends stop only
after both the time budget and depth 15 have been reached, avoiding the previous
depth-15 search followed by a second search restarted from depth 1.

Extract into C:\Users\oka06\magical-shogi and overwrite files.

Get-ChildItem .\fairy-stockfish-wasm\src -Recurse -File |
  Where-Object { $_.Extension -in '.o','.d' } |
  Remove-Item -Force

Remove-Item .\fairy-stockfish-wasm\src\stockfish.js, .\fairy-stockfish-wasm\src\stockfish.wasm, .\public\fairy\stockfish.js, .\public\fairy\stockfish.wasm -ErrorAction SilentlyContinue

npm run build:fairy
npm run dev -- --force
