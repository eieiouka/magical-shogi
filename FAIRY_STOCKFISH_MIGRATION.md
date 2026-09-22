# Fairy-Stockfish移植状況

## 現在の構成

- `fairy-stockfish-engine/`: 魔法将棋ルールを移植したネイティブ検証用ソース
- `fairy-stockfish-wasm/`: 公式ブラウザWASM版へ同じ変更を移したソース
- `public/fairy/fairy-bridge.worker.js`: UCIエンジンとReact側をつなぐWorker
- `src/game/fairyCodec.js`: React盤面⇔FEN、UCI指し手⇔画面アクションの変換
- `wasm-engine/`: Fairy版を生成していない環境で使う従来Rustエンジン

上流はFairy-Stockfish commit `7b97ff4518f0777e9bde0ac2dec601086a4f1d05`を基準にしている。
ライセンスはGPL-3.0-or-later。WASMを配布するときは、この改造ソースも同時に公開する。

## 実装済みルール

- 6×6盤、持ち駒、打てる段の制限、3回同一局面
- 敵陣2段目以降での強制魔女化
- エマの詰み、および安全な最下段到達によるトライ勝ち
- ナノカの動かない銃撃
- ヒロの味方との居合切り入替
- マーゴの跳躍暗殺（中間の敵を捕獲）
- ハンナの中間駒を無視する浮遊
- 特殊手のmake/undo、持ち駒化、ハッシュ、王手判定

初期局面の合法手は15手。assert付きネイティブ版で5手先までの817,644局面を検査済み。
加えて、ランダムに進めた140局面でReact版とFairy版の全合法手が一致している。

## 探索の接続

Fairy版は最初に深度7を完走する。その後、指定思考時間の残りを使って反復深化する。
生成物がない場合、または起動に失敗した場合だけ従来Rust/WASM→JavaScriptの順で自動退避する。

## 残る実機確認

この実行環境ではEmscriptenの巨大なコンパイラ実行ファイルが途中で切れるため、Fairy版WASM
そのものだけは生成できない。Windows側で`npm run build:fairy`を一度実行し、PCとスマホで
固定局面の指し手・速度を確認する。生成後の3ファイルは`public/fairy/`に置かれる。
