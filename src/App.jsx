import {useEffect,useMemo,useRef,useState} from "react";
import "./App.css";
import {PIECES,makeInitialState,generateAllLegalActions,applyLegalAction,terminalResult} from "./game/rules.js";
import {stateKey} from "./game/aiEngine.js";

const HUMAN_SIDE="sente";
const OPPONENT_SIDE="gote";
const HAND_ORDER=["sherry","hanna","hiro","nanoka","margo"];
const imageFor=p=>`/images/pieces/${p.type}_${p.promoted?"red":"black"}.png`;
const voiceFor=(event,side)=>`/audio/${event}-${side}.mp3`;
const playVoice=(event,side)=>{const audio=new Audio(voiceFor(event,side));audio.play().catch(()=>{})};
const actionVoiceFor=(action,piece)=>{
 if(action.category==="drop")return`drop-${piece.type}`;
 if(action.magic)return`magic-${piece.type}`;
 if(action.promote)return`promote-${piece.type}`;
 return`move-${piece.type}`;
};

function Piece({piece,compact=false,perspective=HUMAN_SIDE,forcePromoted=false,promotedOverride}){
 let shownPiece=promotedOverride===undefined?piece:{...piece,promoted:promotedOverride};
 if(forcePromoted)shownPiece={...shownPiece,promoted:true};
 return <div className={`piece piece--${shownPiece.promoted?"red":"black"} ${shownPiece.side!==perspective?"piece--opponent":""} ${compact?"piece--compact":""}`}>
  <span className="piece-fallback">{PIECES[piece.type].short}</span>
  <img src={imageFor(shownPiece)} alt={PIECES[piece.type].name} draggable={false}/>
  <span className="piece-name">{PIECES[piece.type].short}</span>
 </div>;
}

function Hand({className,title,pieces,activeType,onPick,disabled,perspective,reverse=false}){
 const order=reverse?[...HAND_ORDER].reverse():HAND_ORDER;
 const groups=order.map(type=>({type,items:pieces.filter(piece=>piece.type===type)})).filter(group=>group.items.length);
 return <aside className={`hand ${className}`}>
  <div className="hand-title">{title}</div>
  <div className="hand-pieces">{groups.length?groups.map(({type,items})=><div className={`hand-group ${items.length>1?"hand-group--double":""}`} key={type}>{items.map((piece,i)=><button disabled={disabled} key={`${piece.id}-${i}`} className={`hand-piece ${activeType===type?"active":""}`} onClick={()=>onPick(type)} aria-label={`${PIECES[type].name}を選ぶ`}><Piece piece={piece} compact perspective={perspective}/></button>)}</div>):<span className="hand-empty">なし</span>}</div>
 </aside>;
}

export default function App(){
 const initial=useMemo(()=>makeInitialState(),[]);
 const [timeline,setTimeline]=useState([initial]);
 const [selected,setSelected]=useState(null);
 const [handType,setHandType]=useState(null);
 const [thinking,setThinking]=useState(false);
 const [resigned,setResigned]=useState(false);
 const [finishFx,setFinishFx]=useState(null);
 const [finishFxDone,setFinishFxDone]=useState(false);
 const [motionFx,setMotionFx]=useState(null);
 const worker=useRef(null),request=useRef(0),motionFxRef=useRef(null),motionSequence=useRef(0);
 const state=timeline[timeline.length-1];
 const result=useMemo(()=>terminalResult(state),[state]);
 const gameOver=Boolean(result||resigned);
 const canRematch=Boolean(resigned||(result&&finishFxDone));
 const seen=useMemo(()=>timeline.map(stateKey),[timeline]);
 const legal=useMemo(()=>gameOver?[]:generateAllLegalActions(state),[state,gameOver]);
 const selectable=useMemo(()=>legal.filter(a=>a.category==="drop"?handType!==null&&a.piece.type===handType:selected&&a.from?.[0]===selected[0]&&a.from?.[1]===selected[1]),[legal,selected,handType]);

 useEffect(()=>{worker.current=new Worker(new URL("./game/ai.worker.js",import.meta.url),{type:"module"});return()=>worker.current?.terminate()},[]);
 useEffect(()=>{
  if(!result||motionFx)return;
  const losingSide=result.winner===HUMAN_SIDE?OPPONENT_SIDE:HUMAN_SIDE;
  const timers=[];
  setFinishFxDone(false);
  if(result.reason==="ema-safe-try"){
   setFinishFx({phase:"try-transform",winner:result.winner,losingSide,promotionRevealed:false});
   playVoice("try",result.winner);
   timers.push(setTimeout(()=>setFinishFx(current=>current?.phase==="try-transform"?{...current,promotionRevealed:true}:current),600));
   timers.push(setTimeout(()=>{setFinishFx({phase:"try-arrow",winner:result.winner,losingSide});playVoice("arrow",result.winner)},2600));
   timers.push(setTimeout(()=>{setFinishFx({phase:"loser-shake",winner:result.winner,losingSide});playVoice("checkmate",losingSide)},4000));
   timers.push(setTimeout(()=>{setFinishFx({phase:"loser-fall",winner:result.winner,losingSide});playVoice("fall",losingSide)},5400));
   timers.push(setTimeout(()=>{setFinishFx({phase:"done",winner:result.winner,losingSide});setFinishFxDone(true)},6900));
  }else{
   setFinishFx({phase:"loser-shake",winner:result.winner,losingSide});
   playVoice("checkmate",losingSide);
   timers.push(setTimeout(()=>{setFinishFx({phase:"loser-fall",winner:result.winner,losingSide});playVoice("fall",losingSide)},1300));
   timers.push(setTimeout(()=>{setFinishFx({phase:"done",winner:result.winner,losingSide});setFinishFxDone(true)},2700));
  }
  return()=>timers.forEach(clearTimeout);
 },[result,motionFx]);
 useEffect(()=>{
  if(gameOver||!worker.current)return;
  if(state.turn===HUMAN_SIDE){worker.current.postMessage({type:"ponder",state,seen});return}
  setThinking(true);
  const id=++request.current;
  worker.current.onmessage=({data})=>{
   if(data.id!==id)return;
   setThinking(false);
   if(data.error||!data.result)return;
   const commit=()=>{beginMotion(data.result.action,state);setTimeline(x=>[...x,applyLegalAction(x[x.length-1],data.result.action)])};
   const waitForFx=()=>motionFxRef.current?setTimeout(waitForFx,40):commit();
   waitForFx();
  };
  const effectRemainingMs=Math.max(0,(motionFxRef.current?.endsAt??0)-performance.now());
  worker.current.postMessage({type:"think",id,state,seen,timeLimitMs:effectRemainingMs+500});
 },[state,gameOver,seen]);

 function play(action){
  if(thinking||motionFx||state.turn!==HUMAN_SIDE||gameOver)return;
  beginMotion(action,state);
  setTimeline(x=>[...x,applyLegalAction(x[x.length-1],action)]);
  setSelected(null);setHandType(null);
 }
 function click(row,col){
  if(thinking||motionFx||state.turn!==HUMAN_SIDE||gameOver)return;
  const choices=selectable.filter(a=>a.to[0]===row&&a.to[1]===col);
  if(choices.length){play(choices.find(a=>a.magic)||choices[0]);return}
  const piece=state.board[row][col];
  if(piece?.side===HUMAN_SIDE){setSelected([row,col]);setHandType(null)}else setSelected(null);
 }
 function resign(){
  if(gameOver)return;
  request.current++;
  worker.current?.postMessage({type:"reset"});
  setThinking(false);setSelected(null);setHandType(null);setResigned(true);
 }
 function reset(){
  if(!gameOver)return;
  request.current++;
  worker.current?.postMessage({type:"reset"});
  motionFxRef.current=null;setTimeline([makeInitialState()]);setSelected(null);setHandType(null);setThinking(false);setResigned(false);setFinishFx(null);setFinishFxDone(false);setMotionFx(null);
 }
 function beginMotion(action,before){
  const moving=action.category==="drop"?action.piece:before.board[action.from[0]][action.from[1]];
  const moveResult=moving?.type==="ema"?terminalResult(applyLegalAction(before,action)):null;
  const isEmmaPromotion=moveResult?.reason==="ema-safe-try"&&moveResult.winner===before.turn;
  if(moving&&!isEmmaPromotion)playVoice(actionVoiceFor(action,moving),before.turn);
  const captureAt=action.swap?null:action.captureAt??(before.board[action.to[0]][action.to[1]]?[...action.to]:null);
  const captured=captureAt?before.board[captureAt[0]][captureAt[1]]:null;
  const duration=captured?720:action.category==="drop"?470:550;
  const id=++motionSequence.current;
  const fx={id,action,moving,mover:before.turn,captureAt,captured,promotionRevealed:!action.promote,endsAt:performance.now()+duration};
  motionFxRef.current=fx;setMotionFx(fx);
  if(action.promote)setTimeout(()=>{
   if(motionFxRef.current?.id!==id)return;
   const revealed={...motionFxRef.current,promotionRevealed:true};
   motionFxRef.current=revealed;setMotionFx(revealed);
  },213);
  setTimeout(()=>{if(motionFxRef.current?.id===id)motionFxRef.current=null;setMotionFx(current=>current?.id===id?null:current)},duration);
 }

 const targets=new Map(selectable.map(a=>[`${a.to[0]},${a.to[1]}`,a]));
 const endMessage=resigned?"投了しました — 後手の勝ち":result&&finishFxDone?`${result.winner==="sente"?"先手":"後手"}の勝ち`:"";
 const pieceFxClass=piece=>{
  if(!piece||piece.type!=="ema"||!finishFx)return"";
  if((finishFx.phase==="try-transform"||finishFx.phase==="try-arrow")&&piece.side===finishFx.winner)return" ema--try-glow";
  if(finishFx.phase==="loser-shake"&&piece.side===finishFx.losingSide)return" ema--loser-shake";
  if(finishFx.phase==="loser-fall"&&piece.side===finishFx.losingSide)return` ema--loser-fall ema--loser-fall-${piece.side}`;
  if(finishFx.phase==="done"&&piece.side===finishFx.losingSide)return" ema--gone";
  return"";
 };
 const findEmmaPosition=side=>{for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(state.board[r][c]?.type==="ema"&&state.board[r][c].side===side)return[r,c];return null};
 const arrowFrom=finishFx&&findEmmaPosition(finishFx.winner),arrowTo=finishFx&&findEmmaPosition(finishFx.losingSide);
 const showTryArrow=finishFx?.phase==="try-arrow"&&arrowFrom&&arrowTo;
 const motionClass=(piece,r,c)=>{
  if(!motionFx||!piece||piece.side!==motionFx.mover)return"";
  if(motionFx.action.swap&&c===motionFx.action.from[1]&&r===motionFx.action.from[0])return" motion-swap-return";
  if(c!==motionFx.action.to[1]||r!==motionFx.action.to[0])return"";
  if(motionFx.action.category==="drop")return" motion-drop";
  if(motionFx.moving.type==="hanna"&&Math.abs(motionFx.action.to[0]-motionFx.action.from[0])===2)return" motion-float";
  if(motionFx.moving.type==="sherry"&&Math.abs(motionFx.action.to[0]-motionFx.action.from[0])===2)return" motion-dash";
  if(motionFx.action.magic==="跳躍暗殺")return" motion-jump";
  return" motion-slide";
 };
 const motionStyle=(r,c,moveClass)=>{
  if(!moveClass)return undefined;
  if(moveClass.includes("motion-drop"))return dropStyle(r,c);
  if(moveClass.includes("motion-swap-return"))return {"--move-x":`${(motionFx.action.to[1]-c)*100}%`,"--move-y":`${(motionFx.action.to[0]-r)*100}%`};
  return motionFx?.action.from?{"--move-x":`${(motionFx.action.from[1]-c)*100}%`,"--move-y":`${(motionFx.action.from[0]-r)*100}%`}:undefined;
 };
 const captureOrder={sherry:0,hanna:1,hiro:2,nanoka:3,margo:4};
 const visibleHand=side=>{
  const pieces=state.hands[side];
  if(!motionFx?.captured||motionFx.captured.type==="ema"||motionFx.mover!==side)return pieces;
  let hidden=-1;
  for(let i=pieces.length-1;i>=0;i--)if(pieces[i].type===motionFx.captured.type){hidden=i;break}
  return hidden<0?pieces:pieces.filter((_,i)=>i!==hidden);
 };
 const dropStyle=(r,c)=>{
  if(motionFx?.action.category!=="drop")return undefined;
  const orderIndex=HAND_ORDER.indexOf(motionFx.moving.type);
  const visualIndex=motionFx.mover===HUMAN_SIDE?orderIndex:HAND_ORDER.length-1-orderIndex;
  const sourceColumn=motionFx.mover===HUMAN_SIDE?6.72:-.72;
  const sourceRow=(visualIndex+.5)*6/HAND_ORDER.length-.5;
  return {"--drop-x":`${(sourceColumn-c)*100}%`,"--drop-y":`${(sourceRow-r)*100}%`};
 };

 return <div className="app-shell">
  <header className="topbar">
   <div className="branding"><div className="eyebrow">MANOSABA SHOGI AI</div><h1>魔法少女ノ魔法将棋</h1></div>
   <div className="match-actions"><button className="rematch-button" onClick={reset} disabled={!canRematch}>再対局</button><button className="resign-button" onClick={resign} disabled={gameOver}>投了</button></div>
  </header>
  {endMessage&&<div className="result-banner" role="status">{endMessage}</div>}
  <main className="game-stage">
   <Hand className="hand--opponent" title="相手の持ち駒" pieces={visibleHand(OPPONENT_SIDE)} disabled activeType={null} onPick={()=>{}} perspective={HUMAN_SIDE} reverse/>
   <div className="board-frame"><div className="board-container"><div className="board">{state.board.map((row,r)=>row.map((piece,c)=>{const key=`${r},${c}`,target=targets.get(key),fxClass=pieceFxClass(piece),moveClass=motionClass(piece,r,c),tryWinner=piece?.type==="ema"&&result?.reason==="ema-safe-try"&&piece.side===result.winner&&finishFx?.promotionRevealed!==false,moveStyle=motionStyle(r,c,moveClass),promotedOverride=moveClass&&motionFx?.action.promote?Boolean(motionFx.promotionRevealed):undefined;return <button key={key} onClick={()=>click(r,c)} className={`square ${(r+c)%2?"square--alt":""} ${selected?.[0]===r&&selected?.[1]===c?"square--selected":""} ${target?(target.category==="magic"?"square--magic-target":"square--move-target"):""} ${(fxClass||moveClass)?"square--finish-fx":""}`}>{piece&&<div style={moveStyle} className={`finish-piece${fxClass}${moveClass}${moveClass&&motionFx?.action.promote?" motion-promote":""}`}><Piece piece={piece} forcePromoted={tryWinner} promotedOverride={promotedOverride}/></div>}</button>}))}</div>{motionFx?.captured&&motionFx.captureAt&&<div className={`capture-fly capture-fly--${motionFx.mover}`} style={{left:`${motionFx.captureAt[1]*100/6}%`,top:`${motionFx.captureAt[0]*100/6}%`,"--capture-left":motionFx.mover===HUMAN_SIDE?"104%":"-21%","--capture-top":`${(captureOrder[motionFx.captured.type]??2)*20+3}%`}}><Piece piece={{...motionFx.captured,side:motionFx.mover,promoted:false}}/></div>}{showTryArrow&&<svg className="try-arrow" viewBox="0 0 600 600" aria-hidden="true"><defs><filter id="arrow-glow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><line x1={(arrowFrom[1]+.5)*100} y1={(arrowFrom[0]+.5)*100} x2={(arrowTo[1]+.5)*100} y2={(arrowTo[0]+.5)*100} pathLength="1"/></svg>}</div></div>
   <Hand className="hand--player" title="自分の持ち駒" pieces={visibleHand(HUMAN_SIDE)} disabled={state.turn!==HUMAN_SIDE||thinking||motionFx||gameOver} activeType={handType} onPick={type=>{setHandType(type);setSelected(null)}} perspective={HUMAN_SIDE}/>
  </main>
 </div>;
}
