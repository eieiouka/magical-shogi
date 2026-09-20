import {useEffect,useMemo,useRef,useState} from "react";
import "./App.css";
import {PIECES,makeInitialState,generateAllLegalActions,applyLegalAction,terminalResult} from "./game/rules.js";
import {stateKey} from "./game/aiEngine.js";

const HUMAN_SIDE="sente";
const OPPONENT_SIDE="gote";
const imageFor=p=>`/images/pieces/${p.type}_${p.promoted?"red":"black"}.png`;

function Piece({piece,compact=false,perspective=HUMAN_SIDE}){
 return <div className={`piece ${piece.side!==perspective?"piece--opponent":""} ${compact?"piece--compact":""}`}>
  <span className="piece-fallback">{PIECES[piece.type].short}</span>
  <img src={imageFor(piece)} alt={PIECES[piece.type].name} draggable={false}/>
 </div>;
}

function Hand({className,title,pieces,activeType,onPick,disabled,perspective}){
 return <aside className={`hand ${className}`}>
  <div className="hand-title">{title}</div>
  <div className="hand-pieces">{pieces.length?pieces.map((p,i)=><button disabled={disabled} key={`${p.type}-${i}`} className={`hand-piece ${activeType===p.type?"active":""}`} onClick={()=>onPick(p.type)} aria-label={`${PIECES[p.type].name}を選ぶ`}><Piece piece={p} compact perspective={perspective}/></button>):<span className="hand-empty">なし</span>}</div>
 </aside>;
}

export default function App(){
 const initial=useMemo(()=>makeInitialState(),[]);
 const [timeline,setTimeline]=useState([initial]);
 const [selected,setSelected]=useState(null);
 const [handType,setHandType]=useState(null);
 const [thinking,setThinking]=useState(false);
 const [resigned,setResigned]=useState(false);
 const worker=useRef(null),request=useRef(0);
 const state=timeline[timeline.length-1];
 const result=useMemo(()=>terminalResult(state),[state]);
 const gameOver=Boolean(result||resigned);
 const seen=useMemo(()=>timeline.map(stateKey),[timeline]);
 const legal=useMemo(()=>gameOver?[]:generateAllLegalActions(state),[state,gameOver]);
 const selectable=useMemo(()=>legal.filter(a=>a.category==="drop"?handType!==null&&a.piece.type===handType:selected&&a.from?.[0]===selected[0]&&a.from?.[1]===selected[1]),[legal,selected,handType]);

 useEffect(()=>{worker.current=new Worker(new URL("./game/ai.worker.js",import.meta.url),{type:"module"});return()=>worker.current?.terminate()},[]);
 useEffect(()=>{
  if(gameOver||!worker.current)return;
  if(state.turn===HUMAN_SIDE){worker.current.postMessage({type:"ponder",state,seen});return}
  setThinking(true);
  const id=++request.current;
  worker.current.onmessage=({data})=>{
   if(data.id!==id)return;
   setThinking(false);
   if(data.error||!data.result)return;
   setTimeline(x=>[...x,applyLegalAction(x[x.length-1],data.result.action)]);
  };
  worker.current.postMessage({type:"think",id,state,seen});
 },[state,gameOver,seen]);

 function play(action){
  if(thinking||state.turn!==HUMAN_SIDE||gameOver)return;
  setTimeline(x=>[...x,applyLegalAction(x[x.length-1],action)]);
  setSelected(null);setHandType(null);
 }
 function click(row,col){
  if(thinking||state.turn!==HUMAN_SIDE||gameOver)return;
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
  setTimeline([makeInitialState()]);setSelected(null);setHandType(null);setThinking(false);setResigned(false);
 }

 const targets=new Map(selectable.map(a=>[`${a.to[0]},${a.to[1]}`,a]));
 const endMessage=resigned?"投了しました — 後手の勝ち":result?`${result.winner==="sente"?"先手":"後手"}の勝ち`:"";

 return <div className="app-shell">
  <header className="topbar">
   <div className="branding"><div className="eyebrow">MANOSABA SHOGI AI</div><h1>魔法少女ノ魔法将棋</h1></div>
   <div className="match-actions"><button className="rematch-button" onClick={reset} disabled={!gameOver}>再対局</button><button className="resign-button" onClick={resign} disabled={gameOver}>投了</button></div>
  </header>
  {endMessage&&<div className="result-banner" role="status">{endMessage}</div>}
  <main className="game-stage">
   <Hand className="hand--opponent" title="相手の持ち駒" pieces={state.hands[OPPONENT_SIDE]} disabled activeType={null} onPick={()=>{}} perspective={HUMAN_SIDE}/>
   <div className="board-frame"><div className="board-container"><div className="board">{state.board.map((row,r)=>row.map((piece,c)=>{const key=`${r},${c}`,target=targets.get(key);return <button key={key} onClick={()=>click(r,c)} className={`square ${(r+c)%2?"square--alt":""} ${selected?.[0]===r&&selected?.[1]===c?"square--selected":""} ${target?(target.category==="magic"?"square--magic-target":"square--move-target"):""}`}>{piece&&<Piece piece={piece}/>}</button>}))}</div></div></div>
   <Hand className="hand--player" title="自分の持ち駒" pieces={state.hands[HUMAN_SIDE]} disabled={state.turn!==HUMAN_SIDE||thinking||gameOver} activeType={handType} onPick={type=>{setHandType(type);setSelected(null)}} perspective={HUMAN_SIDE}/>
  </main>
 </div>;
}
