## fairy-stockfish-nnue.wasm

[![npm version](https://badge.fury.io/js/fairy-stockfish-nnue.wasm.svg)](https://badge.fury.io/js/fairy-stockfish-nnue.wasm)
[![CI](https://github.com/ianfab/fairy-stockfish.wasm/actions/workflows/ci.yml/badge.svg)](https://github.com/ianfab/fairy-stockfish.wasm/actions/workflows/ci.yml)

WebAssembly port of [Fairy-Stockfish](https://github.com/ianfab/Fairy-Stockfish) with NNUE support, currently used by [pychess.org](https://www.pychess.org) for client-side analysis.

See [fairy-stockfish-nnue-wasm-demo](https://github.com/ianfab/fairy-stockfish-nnue-wasm-demo) for a demo.

For development, see [`src/emscripten/README.md`](src/emscripten/README.md).

Current default branch is `nnue`.

To release a new version:
* Make sure CI passes (update reference bench if required)
* Bump version number in `src/emscripten/public/package.json`
* Create and push a tag with the name corresponding to the version number
