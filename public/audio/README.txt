勝敗演出用ボイスをこのフォルダへ配置してください。

try-sente.mp3        先手エマが発光して魔女化
try-gote.mp3         後手エマが発光して魔女化
arrow-sente.mp3      先手エマが光の矢を発射
arrow-gote.mp3       後手エマが光の矢を発射
hit-sente.mp3        光の矢が先手エマへ命中
hit-gote.mp3         光の矢が後手エマへ命中
fall-sente.mp3       先手エマが自陣方向へ落下
fall-gote.mp3        後手エマが自陣方向へ落下
checkmate-sente.mp3  詰んだ先手エマ
checkmate-gote.mp3   詰んだ後手エマ

着手ボイス（ファイルを置けば自動再生）
ファイル名: 種類-キャラ-陣営.mp3
種類: drop（打つ） / move（通常移動） / promote（成る） / magic（魔法使用）
キャラ: sherry / hanna / hiro / nanoka / margo
陣営: sente / gote

例:
drop-sherry-sente.mp3    先手がシェリーを打つ
move-hanna-gote.mp3      後手ハンナが通常移動
promote-hiro-sente.mp3   先手ヒロが成る
magic-nanoka-gote.mp3    後手ナノカが魔法を使用

同じ着手で条件が重なる場合は magic > promote > move の順で1本だけ再生します。
drop は他の種類と複合しません。

エマは既存の勝敗演出ボイスに加え、通常移動だけを追加してください。
move-ema-sente.mp3       先手エマが通常移動
move-ema-gote.mp3        後手エマが通常移動
敵陣最下段で魔女化するときは通常移動ボイスを鳴らさず、既存の try-sente / try-gote を優先します。

音声が未配置でもゲームとアニメーションは動作します。
