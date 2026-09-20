
// Shared Manosaba Shogi rules engine.
// UI and exhaustive solver should both import this module.

export const FILES = ["6", "5", "4", "3", "2", "1"];
export const RANKS = ["一", "二", "三", "四", "五", "六"];
export const INITIAL_ORDER = ["nanoka", "hanna", "hiro", "ema", "sherry", "margo"];

export const PIECES = {
  nanoka: { name: "黒部ナノカ", short: "ナノカ" },
  hanna: { name: "遠野ハンナ", short: "ハンナ" },
  hiro: { name: "二階堂ヒロ", short: "ヒロ" },
  ema: { name: "桜羽エマ", short: "エマ" },
  sherry: { name: "橘シェリー", short: "シェリー" },
  margo: { name: "宝生マーゴ", short: "マーゴ" },
};

export const opposite = (side) => side === "sente" ? "gote" : "sente";
export const forwardDir = (side) => side === "sente" ? -1 : 1;
export const inside = (r,c) => r >= 0 && r < 6 && c >= 0 && c < 6;
export const squareName = (r,c) => `${FILES[c]}${RANKS[r]}`;

export function makeInitialState() {
  const board = Array.from({length:6}, () => Array(6).fill(null));
  INITIAL_ORDER.forEach((type,col) => {
    board[5][col] = {id:`s-${type}`,type,side:"sente",promoted:false};
    board[0][5-col] = {id:`g-${type}`,type,side:"gote",promoted:false};
  });
  return {
    board,
    hands:{sente:[],gote:[]},
    turn:"sente",
    lastMove:null,
    note:"初期局面",
    winner:null,
    winReason:null,
  };
}

export function cloneBoard(board) {
  return board.map(row => row.map(p => p ? {...p} : null));
}

const inEnemyCamp = (side,row) => side === "sente" ? row <= 1 : row >= 4;
const onEnemyLastRank = (side,row) => side === "sente" ? row === 0 : row === 5;

export function promotionStatus(piece, fromRow, toRow) {
  if (!piece || piece.type === "ema" || piece.promoted)
    return {canPromote:false,mustPromote:false};

  // v13:
  // 敵陣2段目以降へ「移動して入る」手は、成れる駒なら必ず魔女化する。
  // したがって敵陣へ入る着手では「成らない」分岐を生成しない。
  const entersEnemyCamp = inEnemyCamp(piece.side, toRow);

  return {
    canPromote: entersEnemyCamp,
    mustPromote: entersEnemyCamp,
  };
}

function moveAction(piece,from,to,extra={}) {
  return {category:"move",piece,from,to,...extra};
}
function magicAction(piece,from,to,magic,extra={}) {
  return {category:"magic",piece,from,to,magic,...extra};
}
function isEnemy(board,side,r,c) {
  return inside(r,c) && board[r][c] && board[r][c].side !== side;
}
function isFriendly(board,side,r,c) {
  return inside(r,c) && board[r][c] && board[r][c].side === side;
}

export function generatePseudoActions(state,row,col) {
  const board = state.board;
  const piece = board[row][col];
  if (!piece) return [];
  const side = piece.side;
  const f = forwardDir(side);
  const from = [row,col];
  const out = [];

  const addStep = (dr,dc) => {
    const r=row+dr,c=col+dc;
    if (!inside(r,c)) return;
    if (board[r][c]?.side === side) return;
    out.push(moveAction(piece,from,[r,c]));
  };

  const addEight = () => {
    for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
      if (dr || dc) addStep(dr,dc);
    }
  };

  switch(piece.type) {
    case "ema":
      addEight();
      break;

    case "nanoka":
      if (piece.promoted) addEight();
      else { addStep(f,0); addStep(0,-1); addStep(0,1); }

      for (const [dr,dc] of [[2*f,0],[2*f,-2],[2*f,2]]) {
        const tr=row+dr,tc=col+dc,mr=row+dr/2,mc=col+dc/2;
        if (!inside(tr,tc) || board[mr][mc] || !isEnemy(board,side,tr,tc)) continue;
        out.push(magicAction(piece,from,[tr,tc],"銃撃",
          {captureAt:[tr,tc],movePiece:false}));
      }
      break;

    case "hiro":
      if (piece.promoted) addEight();
      else { addStep(f,0); addStep(0,-1); addStep(0,1); }

      for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
        if (!dr && !dc) continue;
        const tr=row+dr,tc=col+dc;
        if (isFriendly(board,side,tr,tc))
          out.push(magicAction(piece,from,[tr,tc],"居合切り",{swap:true}));
      }
      break;

    case "sherry":
      if (piece.promoted) {
        addEight();
        const mid=row+f,end=row+2*f;
        if (inside(end,col) && !board[mid][col] && board[end][col]?.side !== side)
          out.push(moveAction(piece,from,[end,col],{longForward:true}));
      } else {
        const r1=row+f,r2=row+2*f;
        if (inside(r1,col) && !board[r1][col])
          out.push(moveAction(piece,from,[r1,col]));
        if (inside(r2,col) && !board[r1][col] && !board[r2][col])
          out.push(moveAction(piece,from,[r2,col],{longForward:true}));
        for (const dc of [-1,1]) {
          const tr=row+f,tc=col+dc;
          if (isEnemy(board,side,tr,tc))
            out.push(magicAction(piece,from,[tr,tc],"サイドステップ",
              {captureAt:[tr,tc],movePiece:true}));
        }
      }
      break;

    case "margo":
      if (piece.promoted) addEight();
      else { addStep(f,-1); addStep(f,0); addStep(f,1); }

      const back=-f;
      for (const [dr,dc] of [[0,-1],[0,1],[back,-1],[back,0],[back,1]]) {
        const mr=row+dr,mc=col+dc,tr=row+2*dr,tc=col+2*dc;
        if (!inside(tr,tc) || !isEnemy(board,side,mr,mc) || board[tr][tc]) continue;
        out.push(magicAction(piece,from,[tr,tc],"跳躍暗殺",
          {captureAt:[mr,mc],movePiece:true}));
      }
      break;

    case "hanna":
      if (piece.promoted) addEight();
      else { addStep(f,-1); addStep(f,0); addStep(f,1); }

      // Float two forward; intermediate occupancy does not matter.
      const tr=row+2*f;
      if (inside(tr,col) && !board[tr][col])
        out.push(magicAction(piece,from,[tr,col],"浮遊",
          {jumpOver:[row+f,col],movePiece:true}));
      break;
  }
  return out;
}

export function findEmma(board,side) {
  for (let r=0;r<6;r++) for (let c=0;c<6;c++) {
    if (board[r][c]?.side===side && board[r][c]?.type==="ema") return [r,c];
  }
  return null;
}

function actionCapturesSquare(action,r,c) {
  if (action.captureAt)
    return action.captureAt[0]===r && action.captureAt[1]===c;
  if (action.category==="move")
    return action.to[0]===r && action.to[1]===c;
  if (action.category==="magic" && action.movePiece)
    return action.to[0]===r && action.to[1]===c;
  return false;
}

export function isEmmaInCheck(state,side) {
  const ema=findEmma(state.board,side);
  if (!ema) return true;
  const [er,ec]=ema;
  for (let r=0;r<6;r++) for (let c=0;c<6;c++) {
    const p=state.board[r][c];
    if (!p || p.side===side) continue;
    for (const a of generatePseudoActions(state,r,c))
      if (actionCapturesSquare(a,er,ec)) return true;
  }
  return false;
}

function capturedToHand(hands,side,piece) {
  if (!piece || piece.type==="ema") return;
  hands[side].push({
    id:`h-${piece.type}-${Math.random()}`,
    type:piece.type,side,promoted:false
  });
}

export function applyActionRaw(state,action,promote=false) {
  const board=cloneBoard(state.board);
  const hands={sente:[...state.hands.sente],gote:[...state.hands.gote]};
  const [fr,fc]=action.from,[tr,tc]=action.to;
  const moving=board[fr][fc];

  const take=(r,c) => {
    const p=board[r][c];
    if (p) capturedToHand(hands,moving.side,p);
    board[r][c]=null;
  };

  if (action.swap) {
    const q=board[tr][tc];
    // ヒロの入替も「ヒロ自身が移動する手」なので、敵陣での成り判定を反映する。
    board[tr][tc]={
      ...moving,
      promoted:
        moving.type==="ema"
          ? false
          : (moving.promoted || promote)
    };
    board[fr][fc]=q;
  } else if (action.magic==="銃撃") {
    take(...action.captureAt);
  } else {
    if (action.captureAt) take(...action.captureAt);
    else if (board[tr][tc]?.side!==moving.side) take(tr,tc);
    board[fr][fc]=null;
    board[tr][tc]={...moving,promoted:moving.type==="ema"?false:(moving.promoted||promote)};
  }

  return {
    ...state,
    board,hands,
    turn:opposite(state.turn),
    lastMove:{from:[fr,fc],to:[tr,tc],category:action.category},
    winner:null,winReason:null,
  };
}

function actionWouldCaptureEmma(state, action) {
  const enemy = opposite(state.turn);
  const ema = findEmma(state.board, enemy);
  if (!ema) return false;
  return actionCapturesSquare(action, ema[0], ema[1]);
}

function isKingSafeAction(state,action) {
  const moving=state.board[action.from[0]][action.from[1]];
  if (!moving) return false;
  const next=applyActionRaw(state,action,false);
  return !isEmmaInCheck(next,moving.side);
}

export function generateLegalBoardActions(state,row,col) {
  return generatePseudoActions(state,row,col).filter(a=>
    !actionWouldCaptureEmma(state,a) && isKingSafeAction(state,a)
  );
}

function lastRank(side,row) {
  return side==="sente" ? row===0 : row===5;
}

function dropLegal(state,piece,row,col) {
  if (state.board[row][col]) return false;
  // 1段目（相手最下段）への打ちは全駒禁止。
  // シェリー/ハンナも例外ではない。
  // v13の「敵陣2段目へ入ると強制成り」は盤上の移動に対する処理。
  // 持ち駒は今まで通り2段目には打てる（打った瞬間には成らない）。
  if (lastRank(state.turn,row)) return false;

  const board=cloneBoard(state.board);
  board[row][col]={...piece,side:state.turn,promoted:false,id:`d-${piece.type}`};
  const next={...state,board};
  return !isEmmaInCheck(next,state.turn);
}

export function generateAllLegalActions(state) {
  const out=[];

  for (let r=0;r<6;r++) for (let c=0;c<6;c++) {
    const p=state.board[r][c];
    if (!p || p.side!==state.turn) continue;

    for (const base of generateLegalBoardActions(state,r,c)) {
      const ps = base.movePiece === false
        ? {canPromote:false,mustPromote:false}
        : promotionStatus(p,r,base.to[0]);
      if (ps.mustPromote) {
        out.push({...base,promote:true});
      } else if (ps.canPromote) {
        out.push({...base,promote:false});
        out.push({...base,promote:true});
      } else {
        out.push({...base,promote:false});
      }
    }
  }

  const seenDropTypes = new Set();
  state.hands[state.turn].forEach((piece,handIndex)=>{
    if (seenDropTypes.has(piece.type)) return;
    seenDropTypes.add(piece.type);
    for (let r=0;r<6;r++) for (let c=0;c<6;c++) {
      if (dropLegal(state,piece,r,c))
        out.push({category:"drop",piece,handIndex,to:[r,c],promote:false});
    }
  });

  return out;
}

// Search-oriented generator. It returns each legal action together with the
// already-created child state, avoiding a second board clone in the AI.
export function generateAllLegalChildren(state) {
  const out=[];

  for (let r=0;r<6;r++) for (let c=0;c<6;c++) {
    const p=state.board[r][c];
    if (!p || p.side!==state.turn) continue;

    for (const base of generatePseudoActions(state,r,c)) {
      if (actionWouldCaptureEmma(state,base)) continue;
      const plain=applyActionRaw(state,base,false);
      if (isEmmaInCheck(plain,p.side)) continue;
      const ps=base.movePiece===false
        ? {canPromote:false,mustPromote:false}
        : promotionStatus(p,r,base.to[0]);
      if (ps.mustPromote) {
        const action={...base,promote:true};
        out.push({action,state:applyActionRaw(state,action,true)});
      } else if (ps.canPromote) {
        out.push({action:{...base,promote:false},state:plain});
        const action={...base,promote:true};
        out.push({action,state:applyActionRaw(state,action,true)});
      } else {
        out.push({action:{...base,promote:false},state:plain});
      }
    }
  }

  const seenDropTypes=new Set();
  state.hands[state.turn].forEach((piece,handIndex)=>{
    if (seenDropTypes.has(piece.type)) return;
    seenDropTypes.add(piece.type);
    for (let r=0;r<6;r++) for (let c=0;c<6;c++) {
      if (state.board[r][c] || lastRank(state.turn,r)) continue;
      const action={category:"drop",piece,handIndex,to:[r,c],promote:false};
      const child=applyLegalAction(state,action);
      if (!isEmmaInCheck(child,state.turn)) out.push({action,state:child});
    }
  });

  return out;
}

export function applyLegalAction(state,action) {
  if (action.category==="drop") {
    const board=cloneBoard(state.board);
    const hands={sente:[...state.hands.sente],gote:[...state.hands.gote]};
    const [piece]=hands[state.turn].splice(action.handIndex,1);
    const [r,c]=action.to;
    board[r][c]={...piece,side:state.turn,promoted:false,id:`d-${piece.type}-${r}-${c}`};
    return {
      ...state,board,hands,turn:opposite(state.turn),
      lastMove:{from:null,to:[r,c],category:"drop"},
      winner:null,winReason:null
    };
  }
  return applyActionRaw(state,action,!!action.promote);
}

export function terminalResult(state, legalActions=null) {
  // If the previous mover's Emma reached the opponent's last rank, that side won immediately.
  for (const side of ["sente","gote"]) {
    const e=findEmma(state.board,side);
    if (e && lastRank(side,e[0])) {
      // トライは「相手最下段へ到達」だけでは成立しない。
      // 到達したエマが相手の利きに入っていないことを明示確認する。
      // （通常の合法手生成でも王手放置は除外するが、終端判定側でも保証する）
      if (!isEmmaInCheck(state, side)) {
        const winner=side;
        return {
          score: winner===state.turn ? 1 : -1,
          winner,
          reason:"ema-safe-try"
        };
      }
    }
  }

  const legal=legalActions ?? generateAllLegalActions(state);
  if (legal.length===0) {
    // No legal move under shogi-like no-pass rule = loss for side to move.
    return {score:-1,winner:opposite(state.turn),reason:isEmmaInCheck(state,state.turn)?"checkmate":"no-legal-move"};
  }
  return null;
}

export function actionLabel(state,action) {
  if (action.category==="drop")
    return `${state.turn==="sente"?"▲":"△"}${PIECES[action.piece.type].short}打 ${squareName(...action.to)}`;
  const p=state.board[action.from[0]][action.from[1]];
  return `${state.turn==="sente"?"▲":"△"}${PIECES[p.type].short} ${squareName(...action.from)}→${squareName(...action.to)}${action.magic?` ${action.magic}`:""}${action.promote?" 成":""}`;
}
