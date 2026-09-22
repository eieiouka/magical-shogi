const PIECE_TO_FEN={nanoka:"n",hanna:"h",hiro:"i",ema:"k",sherry:"s",margo:"m"};
const FEN_TO_PIECE={n:"nanoka",h:"hanna",i:"hiro",k:"ema",s:"sherry",m:"margo"};

const square=([row,col])=>`${String.fromCharCode(97+col)}${6-row}`;
const coords=(text)=>[6-Number(text[1]),text.charCodeAt(0)-97];
const enemyCamp=(side,row)=>side==="sente"?row<=1:row>=4;

export function stateToFairyFen(state){
  const ranks=state.board.map(row=>{
    let empty=0,out="";
    for(const piece of row){
      if(!piece){empty++;continue}
      if(empty){out+=empty;empty=0}
      let letter=PIECE_TO_FEN[piece.type];
      if(piece.side==="sente")letter=letter.toUpperCase();
      out+=(piece.promoted?"+":"")+letter;
    }
    return out+(empty||"");
  }).join("/");
  const handPieces=[];
  for(const side of ["sente","gote"]){
    for(const piece of state.hands[side]){
      let letter=PIECE_TO_FEN[piece.type];
      handPieces.push(side==="sente"?letter.toUpperCase():letter);
    }
  }
  return `${ranks}[${handPieces.join("")||"-"}] ${state.turn==="sente"?"w":"b"} - - 0 1`;
}

export function fairyMoveToAction(state,uciMove){
  if(!uciMove||uciMove==="(none)"||uciMove==="0000")return null;
  const drop=uciMove.match(/^([nhiksm])@([a-f][1-6])$/i);
  if(drop){
    const type=FEN_TO_PIECE[drop[1].toLowerCase()];
    const handIndex=state.hands[state.turn].findIndex(piece=>piece.type===type);
    if(handIndex<0)throw new Error(`Fairy-Stockfish returned unavailable drop: ${uciMove}`);
    return {category:"drop",piece:state.hands[state.turn][handIndex],handIndex,to:coords(drop[2]),promote:false};
  }

  const move=uciMove.match(/^([a-f][1-6])([a-f][1-6])(\+)?$/);
  if(!move)throw new Error(`Unsupported Fairy-Stockfish move: ${uciMove}`);
  const from=coords(move[1]),to=coords(move[2]);
  const piece=state.board[from[0]]?.[from[1]];
  if(!piece)throw new Error(`Fairy-Stockfish source is empty: ${uciMove}`);
  const target=state.board[to[0]]?.[to[1]];
  const dr=to[0]-from[0],dc=to[1]-from[1];
  const forward=piece.side==="sente"?-1:1;
  const promote=!!move[3]||(!piece.promoted&&piece.type!=="ema"&&enemyCamp(piece.side,to[0]));
  const base={piece,from,to,promote};

  if(piece.type==="nanoka"&&Math.abs(dr)===2&&Math.abs(dc)<=2&&target?.side!==piece.side)
    return {...base,category:"magic",magic:"銃撃",captureAt:to,movePiece:false,promote:false};
  if(piece.type==="hiro"&&target?.side===piece.side)
    return {...base,category:"magic",magic:"居合切り",swap:true};
  if(piece.type==="margo"&&!target&&Math.max(Math.abs(dr),Math.abs(dc))===2){
    const mid=[from[0]+dr/2,from[1]+dc/2];
    if(state.board[mid[0]]?.[mid[1]]?.side!==piece.side)
      return {...base,category:"magic",magic:"跳躍暗殺",captureAt:mid,movePiece:true};
  }
  if(piece.type==="hanna"&&dr===2*forward&&dc===0)
    return {...base,category:"magic",magic:"浮遊",jumpOver:[from[0]+forward,from[1]],movePiece:true};
  if(piece.type==="sherry"&&!piece.promoted&&dr===forward&&Math.abs(dc)===1&&target?.side!==piece.side)
    return {...base,category:"magic",magic:"サイドステップ",captureAt:to,movePiece:true};
  return {...base,category:"move",...(piece.type==="sherry"&&dc===0&&Math.abs(dr)===2?{longForward:true}:{})};
}

export const fairySquare=square;
