import {useEffect,useMemo,useRef,useState} from "react";
import "./App.css";
import {PIECES,makeInitialState,generateAllLegalActions,generateLegalBoardActions,applyLegalAction,terminalResult,isEmmaInCheck} from "./game/rules.js";
import {stateKey} from "./game/aiEngine.js";

const randomSide=()=>Math.random()<.5?"sente":"gote";
const HAND_ORDER=["sherry","hanna","hiro","nanoka","margo"];
const DIFFICULTIES=[
 {label:"簡単",depth:11},
 {label:"普通",depth:13},
 {label:"難しい",depth:15},
];
const PIECE_GUIDES={
 ema:{move:"8方向に1マス移動できます。",magicName:"魔女殺し",magic:"相手側の最下段へ到達すると、魔女化して相手のエマを殺せます（勝利）。"},
 nanoka:{move:"前・左右に1マス、魔女化後は8方向に1マス移動できます。",magicName:"遠方狙撃",magic:"前方2マス、斜め前2マスの敵を銃撃します。間に駒がある場合は撃てません。"},
 hanna:{move:"前・斜め前に1マス、魔女化後は8方向に1マス移動できます。",magicName:"空中浮遊",magic:"前方へ2マス移動できます。間の駒は飛び越えられますが、着地先の駒は取れません。"},
 hiro:{move:"前・左右に1マス、魔女化後は8方向に1マス移動できます。",magicName:"すり替え",magic:"8方向に隣接する味方の駒と、自身の位置を入れ替えます。"},
 sherry:{move:"前に1マス移動できますが、駒を取れません。駒を取る時だけは、斜め前に1マス移動できます。魔女化後は8方向1マスと前2マスへ移動できます。",magicName:"全力突進",magic:"前方へ2マス移動できます。途中・着地点に駒がある場合は進めません。"},
 margo:{move:"前・斜め前に1マス、魔女化後は8方向に1マス移動できます。",magicName:"跳躍暗殺",magic:"着地点が空いていれば、横・斜め後ろ・後ろ側の敵を飛び越え、取ることができます。"},
};
const MOBILE_LAYOUT_QUERY="(max-width: 760px) and (hover: none) and (pointer: coarse)";
const imageFor=p=>`/images/pieces/${p.type}_${p.promoted?"red":"black"}.png`;
// Voice files are shared by both sides. The board orientation changes, but the
// character and line do not, so sente/gote suffixes only duplicated assets.
const activeAudio=new Set();
let sharedAudioContext=null;
const audioBufferCache=new Map();
const loadAudioBuffer=file=>{
 if(audioBufferCache.has(file))return audioBufferCache.get(file);
 const loading=fetch(`/audio/${file}`,{cache:"force-cache"})
  .then(response=>{if(!response.ok)throw new Error(`${file}: ${response.status}`);return response.arrayBuffer()})
  .then(bytes=>sharedAudioContext.decodeAudioData(bytes))
  .catch(()=>null);
 audioBufferCache.set(file,loading);
 return loading;
};
const unlockAllSounds=()=>{
 const AudioContextClass=window.AudioContext||window.webkitAudioContext;
 if(!AudioContextClass)return;
 if(!sharedAudioContext)sharedAudioContext=new AudioContextClass();
 sharedAudioContext.resume().catch(()=>{});
 // Start one silent sample inside the user's difficulty-selection tap. This
 // unlocks the shared context for every later CPU voice, even after a long search.
 const buffer=sharedAudioContext.createBuffer(1,1,sharedAudioContext.sampleRate);
 const source=sharedAudioContext.createBufferSource();
 source.buffer=buffer;source.connect(sharedAudioContext.destination);source.start();
};
const playHtmlSound=file=>new Promise(resolve=>{
 const audio=new Audio(`/audio/${file}`);
 activeAudio.add(audio);
 let settled=false;
 const started=()=>{if(settled)return;settled=true;clearTimeout(fallback);resolve()};
 const finished=()=>activeAudio.delete(audio);
 const fallback=setTimeout(started,1500);
 audio.addEventListener("playing",started,{once:true});
 audio.addEventListener("ended",finished,{once:true});
 audio.addEventListener("error",()=>{finished();started()},{once:true});
 audio.play().catch(()=>{finished();started()});
});
const playSound=async file=>{
 try{
  if(!sharedAudioContext)return playHtmlSound(file);
  if(sharedAudioContext.state!=="running")await sharedAudioContext.resume();
  const buffer=await loadAudioBuffer(file);
  if(!buffer)return playHtmlSound(file);
  const source=sharedAudioContext.createBufferSource();
  source.buffer=buffer;source.connect(sharedAudioContext.destination);source.start();
 }catch{return playHtmlSound(file)}
};
const playVoice=event=>playSound(`${event}.mp3`);
const actionVoiceFor=(action,piece,givesCheck=false)=>{
 if(givesCheck&&piece.type!=="ema")return`check-${piece.type}`;
 if(action.category==="drop")return null;
 if(piece.type==="ema")return null;
 // Sherry's two-square advance is her magic. Her diagonal capture is silent,
 // except when that move also promotes. Promotion wins over a simultaneous rush.
 if(piece.type==="sherry"){
  if(action.longForward&&action.promote)return"promote-sherry";
  if(action.longForward)return"magic-sherry";
  if(action.promote)return"promote-sherry";
  return null;
 }
 if(action.promote)return`promote-${piece.type}`;
 if(action.magic)return`magic-${piece.type}`;
 return null;
};

function Piece({piece,compact=false,perspective="sente",forcePromoted=false,promotedOverride}){
 let shownPiece=promotedOverride===undefined?piece:{...piece,promoted:promotedOverride};
 if(forcePromoted)shownPiece={...shownPiece,promoted:true};
 return <div className={`piece piece--${shownPiece.promoted?"red":"black"} ${shownPiece.side!==perspective?"piece--opponent":""} ${compact?"piece--compact":""}`} role="img" aria-label={PIECES[piece.type].name}>
  <img src={imageFor(shownPiece)} alt="" aria-hidden="true" draggable={false}/>
  <span className="piece-name">{PIECES[piece.type].short}</span>
 </div>;
}

function Hand({className,title,pieces,activeType,onPick,disabled,perspective,reverse=false,onGuideStart,onGuideEnd}){
 const order=reverse?[...HAND_ORDER].reverse():HAND_ORDER;
 const groups=order.map(type=>({type,items:pieces.filter(piece=>piece.type===type)})).filter(group=>group.items.length);
 return <aside className={`hand ${className}`}>
  <div className="hand-title">{title}</div>
  <div className={`hand-pieces ${groups.length?"":"hand-pieces--empty"}`}>{groups.length?groups.map(({type,items})=><div className={`hand-group ${items.length>1?"hand-group--double":""}`} key={type}>{items.map((piece,i)=><button aria-disabled={disabled} key={`${piece.id}-${i}`} className={`hand-piece ${activeType===type?"active":""}`} onClick={()=>{if(!disabled)onPick(type)}} onPointerDown={()=>onGuideStart?.(piece,null,null)} onPointerUp={onGuideEnd} onPointerCancel={onGuideEnd} onPointerLeave={onGuideEnd} onContextMenu={event=>event.preventDefault()} aria-label={`${PIECES[type].name}を選ぶ`}><Piece piece={piece} compact perspective={perspective}/></button>)}</div>):<span className="hand-empty">なし</span>}</div>
 </aside>;
}

function DifficultyDialog({onChoose,onCancel}){
 return <div className="difficulty-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onCancel()}}>
  <section className="difficulty-dialog" role="dialog" aria-modal="true" aria-labelledby="difficulty-title">
   <h2 id="difficulty-title">難易度を選択</h2>
   <div className="difficulty-options">{DIFFICULTIES.map(item=><button key={item.depth} type="button" onClick={()=>onChoose(item.depth)}>
    <strong>{item.label}</strong>
   </button>)}</div>
   <p>※難易度が高いほど、処理が重くなります</p>
   <button className="difficulty-cancel" type="button" onClick={onCancel}>戻る</button>
  </section>
 </div>;
}

function PieceGuide({piece,onClose}){
 const guide=PIECE_GUIDES[piece.type];
 return <aside className="piece-guide" role="dialog" aria-label={`${PIECES[piece.type].name}の動き`}>
  <div className="piece-guide__heading"><strong>{PIECES[piece.type].name}</strong><span>{piece.promoted?"魔女化":"通常"}</span><button type="button" onClick={onClose} aria-label="閉じる">×</button></div>
  <p className="piece-guide__move"><b>通常移動</b>{guide.move}</p>
  <p className="piece-guide__ability"><b>{guide.magicName}</b>{guide.magic}</p>
 </aside>;
}

function HowToPlayDialog({onClose}){
 return <div className="how-to-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
  <section className="how-to-dialog" role="dialog" aria-modal="true" aria-labelledby="how-to-title">
   <div className="how-to-dialog__heading"><h2 id="how-to-title">How to play</h2><button type="button" onClick={onClose} aria-label="閉じる">×</button></div>
   <p>桜羽エマを取られたら負けです。桜羽エマが成ると特殊勝利できます。</p>
   <p>エマだけは敵陣最下段、他の駒は敵陣二段目に移動すると魔女化します。</p>
   <p>取った駒は打てますが、敵陣最下段には打てません。</p>
   <p className="how-to-dialog__longpress">長押しで駒の能力を見れます。</p>
  </section>
 </div>;
}

export default function App(){
 const initial=useMemo(()=>makeInitialState(),[]);
 const [started,setStarted]=useState(false);
 const [humanSide,setHumanSide]=useState("sente");
 const opponentSide=humanSide==="sente"?"gote":"sente";
 const [timeline,setTimeline]=useState([initial]);
 const [selected,setSelected]=useState(null);
 const [handType,setHandType]=useState(null);
 const [thinking,setThinking]=useState(false);
 const [resigned,setResigned]=useState(false);
 const [finishFx,setFinishFx]=useState(null);
 const [finishFxDone,setFinishFxDone]=useState(false);
 const [resultRevealReady,setResultRevealReady]=useState(false);
 const [motionFx,setMotionFx]=useState(null);
 const [audioSyncing,setAudioSyncing]=useState(false);
 const [difficultyDepth,setDifficultyDepth]=useState(15);
 const [difficultyPrompt,setDifficultyPrompt]=useState(null);
 const [pieceGuide,setPieceGuide]=useState(null);
 const [showHowTo,setShowHowTo]=useState(false);
 const [mobileLayout,setMobileLayout]=useState(()=>typeof window!=="undefined"&&window.matchMedia(MOBILE_LAYOUT_QUERY).matches);
 const worker=useRef(null),request=useRef(0),motionFxRef=useRef(null),motionSequence=useRef(0),resultVoicePlayed=useRef(false);
 const guideTimer=useRef(null),guideTriggered=useRef(false);
 const state=timeline[timeline.length-1];
 const result=useMemo(()=>terminalResult(state),[state]);
 const checkedSide=!result&&isEmmaInCheck(state,state.turn)?state.turn:null;
 const gameOver=Boolean(result||resigned);
 const seen=useMemo(()=>timeline.map(stateKey),[timeline]);
 const legal=useMemo(()=>gameOver?[]:generateAllLegalActions(state),[state,gameOver]);
 const selectable=useMemo(()=>legal.filter(a=>a.category==="drop"?handType!==null&&a.piece.type===handType:selected&&a.from?.[0]===selected[0]&&a.from?.[1]===selected[1]),[legal,selected,handType]);
 const guideActions=useMemo(()=>{
  if(!pieceGuide||pieceGuide.row==null||pieceGuide.col==null)return[];
  const guideState=state.turn===pieceGuide.piece.side?state:{...state,turn:pieceGuide.piece.side};
  return generateLegalBoardActions(guideState,pieceGuide.row,pieceGuide.col);
 },[state,pieceGuide]);
 const guideTargets=useMemo(()=>{
  const targets=new Map();
  for(const action of guideActions){
   const key=`${action.to[0]},${action.to[1]}`;
   if(action.category==="magic"||action.longForward)targets.set(key,"magic");
   else if(!targets.has(key))targets.set(key,"normal");
  }
  return targets;
 },[guideActions]);

 useEffect(()=>{worker.current=new Worker(new URL("./game/ai.worker.js",import.meta.url),{type:"module"});return()=>worker.current?.terminate()},[]);
 useEffect(()=>{
  const query=window.matchMedia(MOBILE_LAYOUT_QUERY);
  const update=()=>setMobileLayout(query.matches);
  update();query.addEventListener?.("change",update);
  return()=>query.removeEventListener?.("change",update);
 },[]);
 useEffect(()=>()=>clearTimeout(guideTimer.current),[]);
 useEffect(()=>{setPieceGuide(null);guideTriggered.current=false},[state]);
 useEffect(()=>{
  if(!result||motionFx)return;
  const losingSide=result.winner===humanSide?opponentSide:humanSide;
  const timers=[];let cancelled=false;
  const wait=ms=>new Promise(resolve=>timers.push(setTimeout(resolve,ms)));
  const syncPhase=async(voice,phase)=>{
   await playVoice(voice);
   if(!cancelled)setFinishFx(phase);
  };
  setFinishFxDone(false);
  setResultRevealReady(false);
  const run=async()=>{
   if(result.reason==="ema-safe-try"){
    await syncPhase("try",{phase:"try-transform",winner:result.winner,losingSide,promotionRevealed:false});
    if(cancelled)return;
    await wait(600);if(cancelled)return;
    setFinishFx(current=>current?.phase==="try-transform"?{...current,promotionRevealed:true}:current);
    await wait(2000);if(cancelled)return;
    await syncPhase("arrow",{phase:"try-arrow",winner:result.winner,losingSide,promotionRevealed:true});
    await wait(1400);if(cancelled)return;
    await syncPhase("checkmate",{phase:"loser-shake",winner:result.winner,losingSide,promotionRevealed:true});
    await wait(1400);if(cancelled)return;
    await syncPhase("fall",{phase:"loser-fall",winner:result.winner,losingSide,promotionRevealed:true});
    await wait(1500);if(cancelled)return;
    setFinishFx({phase:"done",winner:result.winner,losingSide,promotionRevealed:true});setFinishFxDone(true);
   }else{
    await syncPhase("checkmate",{phase:"loser-shake",winner:result.winner,losingSide});
    await wait(1300);if(cancelled)return;
    await syncPhase("fall",{phase:"loser-fall",winner:result.winner,losingSide});
    await wait(1400);if(cancelled)return;
    setFinishFx({phase:"done",winner:result.winner,losingSide});setFinishFxDone(true);
   }
  };
  run();
  return()=>{cancelled=true;timers.forEach(clearTimeout)};
 },[result,motionFx,humanSide,opponentSide]);
 useEffect(()=>{
  if(!result||!finishFxDone||resultVoicePlayed.current)return;
  resultVoicePlayed.current=true;
  const timer=setTimeout(async()=>{await playSound(result.winner===humanSide?"victory.mp3":"defeat.mp3");setResultRevealReady(true)},1000);
  return()=>clearTimeout(timer);
 },[result,finishFxDone,humanSide]);
 useEffect(()=>{
  if(!started||gameOver||!worker.current)return;
  if(state.turn===humanSide){worker.current.postMessage({type:"ponder",state,seen,minDepth:difficultyDepth});return}
  setThinking(true);
  const id=++request.current;
  const effectEndsAt=Math.max(performance.now(),motionFxRef.current?.endsAt??0);
  const earliestCommitAt=effectEndsAt+1000;
  worker.current.onmessage=({data})=>{
   if(data.id!==id)return;
   setThinking(false);
   if(data.error||!data.result)return;
   const commit=()=>commitAction(data.result.action,state);
   const waitForFx=()=>{
    if(motionFxRef.current){setTimeout(waitForFx,40);return}
    const remaining=earliestCommitAt-performance.now();
    if(remaining>0){setTimeout(waitForFx,remaining);return}
    commit();
   };
   waitForFx();
  };
  const effectRemainingMs=Math.max(0,effectEndsAt-performance.now());
  worker.current.postMessage({type:"think",id,state,seen,timeLimitMs:effectRemainingMs+1000,minDepth:difficultyDepth});
 },[state,gameOver,seen,humanSide,started,difficultyDepth]);

 async function commitAction(action,before){
  setAudioSyncing(true);
  await beginMotion(action,before);
  setTimeline(x=>[...x,applyLegalAction(x[x.length-1],action)]);
  setAudioSyncing(false);
 }
 function play(action){
  if(thinking||motionFx||audioSyncing||state.turn!==humanSide||gameOver)return;
  commitAction(action,state);
  setSelected(null);setHandType(null);
 }
 function beginPieceGuide(piece,row,col){
  if(!piece||motionFx||audioSyncing)return;
  clearTimeout(guideTimer.current);guideTriggered.current=false;
  guideTimer.current=setTimeout(()=>{
   guideTriggered.current=true;
   setSelected(null);setHandType(null);
   setPieceGuide({piece:{...piece},row,col});
   navigator.vibrate?.(18);
  },500);
 }
 function endPieceGuide(){clearTimeout(guideTimer.current)}
 function click(row,col){
  if(guideTriggered.current){guideTriggered.current=false;return}
  if(pieceGuide){setPieceGuide(null);return}
  if(thinking||motionFx||audioSyncing||state.turn!==humanSide||gameOver)return;
  const choices=selectable.filter(a=>a.to[0]===row&&a.to[1]===col);
  if(choices.length){play(choices.find(a=>a.magic)||choices[0]);return}
  const piece=state.board[row][col];
  if(piece?.side===humanSide){setSelected([row,col]);setHandType(null)}else setSelected(null);
 }
 async function resign(){
  if(gameOver)return;
  request.current++;
 worker.current?.postMessage({type:"reset"});
  resultVoicePlayed.current=true;
  setAudioSyncing(true);
  await playSound("defeat.mp3");
  setAudioSyncing(false);
  setThinking(false);setSelected(null);setHandType(null);setResigned(true);
 }
 async function startNewMatch(depth){
  request.current++;
  worker.current?.postMessage({type:"reset"});
  unlockAllSounds();
  setAudioSyncing(true);
  await playSound("match-start.mp3");
  motionFxRef.current=null;resultVoicePlayed.current=false;setDifficultyDepth(depth);setDifficultyPrompt(null);setHumanSide(randomSide());setTimeline([makeInitialState()]);setSelected(null);setHandType(null);setThinking(false);setResigned(false);setFinishFx(null);setFinishFxDone(false);setResultRevealReady(false);setMotionFx(null);setStarted(true);setAudioSyncing(false);
 }
 async function beginMotion(action,before){
  const moving=action.category==="drop"?action.piece:before.board[action.from[0]][action.from[1]];
  const after=applyLegalAction(before,action);
  const moveResult=terminalResult(after);
  const givesCheck=!moveResult&&isEmmaInCheck(after,after.turn);
  const captureAt=action.swap?null:action.captureAt??(before.board[action.to[0]][action.to[1]]?[...action.to]:null);
  const captured=captureAt?before.board[captureAt[0]][captureAt[1]]:null;
  // A terminal win owns the voice channel. Do not overlap its checkmate/try
  // sequence with promotion or magic voices from the winning move.
  const isNanokaShot=Boolean(moving?.type==="nanoka"&&action.magic==="銃撃"&&captured&&captureAt);
  const actionVoice=moving&&!moveResult?actionVoiceFor(action,moving,givesCheck):null;
  const sounds=[];
  if(actionVoice)sounds.push(playVoice(actionVoice));
  if(sounds.length)await Promise.all(sounds);
  const impactDelay=isNanokaShot?320:0;
  const duration=isNanokaShot?1050:captured?720:action.category==="drop"?470:550;
  const id=++motionSequence.current;
  const fx={id,action,moving,mover:before.turn,captureAt,captured,capturedOriginalSide:captured?.side??null,isNanokaShot,impactReached:!isNanokaShot,impactDelay,promotionRevealed:!action.promote,endsAt:performance.now()+duration};
  motionFxRef.current=fx;setMotionFx(fx);
  if(isNanokaShot)setTimeout(()=>{
   if(motionFxRef.current?.id!==id)return;
   const impacted={...motionFxRef.current,impactReached:true,impactDelay:0};
   motionFxRef.current=impacted;setMotionFx(impacted);
  },impactDelay);
  if(action.promote)setTimeout(()=>{
   if(motionFxRef.current?.id!==id)return;
   const revealed={...motionFxRef.current,promotionRevealed:true};
   motionFxRef.current=revealed;setMotionFx(revealed);
  },213);
  setTimeout(()=>{if(motionFxRef.current?.id===id)motionFxRef.current=null;setMotionFx(current=>current?.id===id?null:current)},duration);
 }

 const targets=new Map(selectable.map(a=>[`${a.to[0]},${a.to[1]}`,a]));
 const endMessage=resigned?"敗北…":result&&finishFxDone&&resultRevealReady?(result.winner===humanSide?"勝利！":"敗北…"):"";
 const pieceFxClass=piece=>{
  if(!piece||piece.type!=="ema"||!finishFx)return"";
  if((finishFx.phase==="try-transform"||finishFx.phase==="try-arrow")&&piece.side===finishFx.winner)return" ema--try-glow";
  if(finishFx.phase==="loser-shake"&&piece.side===finishFx.losingSide)return" ema--loser-shake";
  if(finishFx.phase==="loser-fall"&&piece.side===finishFx.losingSide)return` ema--loser-fall ema--loser-fall-${piece.side===humanSide?"sente":"gote"}`;
  if(finishFx.phase==="done"&&piece.side===finishFx.losingSide)return" ema--gone";
  return"";
 };
 const findEmmaPosition=side=>{for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(state.board[r][c]?.type==="ema"&&state.board[r][c].side===side)return[r,c];return null};
 const arrowFrom=finishFx&&findEmmaPosition(finishFx.winner),arrowTo=finishFx&&findEmmaPosition(finishFx.losingSide);
 const showTryArrow=finishFx?.phase==="try-arrow"&&arrowFrom&&arrowTo;
 const showNanokaShot=Boolean(motionFx?.isNanokaShot&&motionFx.action.from&&motionFx.captureAt);
 const toVisual=([r,c])=>humanSide==="sente"?[r,c]:[5-r,5-c];
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
  const direction=humanSide==="sente"?1:-1;
  if(moveClass.includes("motion-swap-return"))return {"--move-x":`${(motionFx.action.to[1]-c)*100*direction}%`,"--move-y":`${(motionFx.action.to[0]-r)*100*direction}%`};
  return motionFx?.action.from?{"--move-x":`${(motionFx.action.from[1]-c)*100*direction}%`,"--move-y":`${(motionFx.action.from[0]-r)*100*direction}%`}:undefined;
 };
 const captureOrder={sherry:0,hanna:1,hiro:2,nanoka:3,margo:4};
 const captureTargetIndex=motionFx?.captured?(motionFx.mover===humanSide?captureOrder[motionFx.captured.type]:4-captureOrder[motionFx.captured.type]):2;
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
  const visualIndex=motionFx.mover===humanSide?orderIndex:HAND_ORDER.length-1-orderIndex;
  const sourceColumn=mobileLayout?(visualIndex+.5)*6/HAND_ORDER.length-.5:motionFx.mover===humanSide?6.72:-.72;
  const sourceRow=mobileLayout?(motionFx.mover===humanSide?6.72:-.72):(visualIndex+.5)*6/HAND_ORDER.length-.5;
  const [visualRow,visualColumn]=toVisual([r,c]);
  return {"--drop-x":`${(sourceColumn-visualColumn)*100}%`,"--drop-y":`${(sourceRow-visualRow)*100}%`};
 };

 const visualCells=Array.from({length:36},(_,index)=>{
  const visualRow=Math.floor(index/6),visualColumn=index%6;
  const [row,column]=humanSide==="sente"?[visualRow,visualColumn]:[5-visualRow,5-visualColumn];
  return{row,column};
 });
 const captureVisual=motionFx?.captureAt?toVisual(motionFx.captureAt):null;
 const captureDestination=mobileLayout
  ?{"--capture-left":`${(captureTargetIndex??2)*20+3}%`,"--capture-top":motionFx?.mover===humanSide?"104%":"-21%"}
  :{"--capture-left":motionFx?.mover===humanSide?"104%":"-21%","--capture-top":`${(captureTargetIndex??2)*20+3}%`};
 const shotFrom=showNanokaShot?toVisual(motionFx.action.from):null,shotTo=showNanokaShot?toVisual(motionFx.captureAt):null;
 const tryFrom=showTryArrow?toVisual(arrowFrom):null,tryTo=showTryArrow?toVisual(arrowTo):null;

 if(!started)return <main className="title-screen">
  <div className="title-screen__shade" aria-hidden="true"/>
 <h2 className="title-screen__logo">魔法少女ノ魔法将棋</h2>
 <div className="title-screen__actions">
   <button className="title-screen__start" onClick={()=>setDifficultyPrompt("start")}>ゲーム開始</button>
   <a className="title-screen__shop" href="https://noplannanoka.booth.pm/items/8824608" target="_blank" rel="noreferrer">友達と対戦したい！</a>
  </div>
  {difficultyPrompt&&<DifficultyDialog onChoose={startNewMatch} onCancel={()=>setDifficultyPrompt(null)}/>} 
 </main>;

 return <div className="app-shell">
  <header className="topbar">
   <div className="branding"><div className="eyebrow">MANOSABA SHOGI AI</div><h1>魔法少女ノ魔法将棋</h1></div>
   <div className="match-actions"><button className="resign-button" onClick={resign} disabled={gameOver}>投了</button></div>
  </header>
  <main className="game-stage">
   <Hand className="hand--opponent" title="相手の持ち駒" pieces={visibleHand(opponentSide)} disabled activeType={null} onPick={()=>{}} perspective={humanSide} reverse onGuideStart={beginPieceGuide} onGuideEnd={endPieceGuide}/>
   <div className="board-stack"><div className="board-frame"><div className="board-container"><div className="board">{visualCells.map(({row:r,column:c})=>{const key=`${r},${c}`,piece=state.board[r][c],target=targets.get(key),guideTarget=guideTargets.get(key),pendingCaptured=motionFx?.isNanokaShot&&!motionFx.impactReached&&motionFx.captureAt?.[0]===r&&motionFx.captureAt?.[1]===c?{...motionFx.captured,side:motionFx.capturedOriginalSide}:null,shownPiece=piece??pendingCaptured,fxClass=pieceFxClass(shownPiece),moveClass=motionClass(shownPiece,r,c),checkClass=shownPiece?.type==="ema"&&shownPiece.side===checkedSide?" ema--in-check":"",tryWinner=Boolean(shownPiece?.type==="ema"&&result?.reason==="ema-safe-try"&&shownPiece.side===result.winner),moveStyle=motionStyle(r,c,moveClass),promotedOverride=tryWinner?finishFx?.promotionRevealed===true:moveClass&&motionFx?.action.promote?Boolean(motionFx.promotionRevealed):undefined;return <button key={key} onClick={()=>click(r,c)} onPointerDown={()=>beginPieceGuide(piece,r,c)} onPointerUp={endPieceGuide} onPointerCancel={endPieceGuide} onPointerLeave={endPieceGuide} onContextMenu={event=>event.preventDefault()} className={`square ${(r+c)%2?"square--alt":""} ${selected?.[0]===r&&selected?.[1]===c?"square--selected":""} ${target?((target.category==="magic"||target.longForward)?"square--magic-target":"square--move-target"):""} ${pieceGuide?.row===r&&pieceGuide?.col===c?"square--guide-source":""} ${guideTarget?`square--guide-${guideTarget}`:""} ${(fxClass||moveClass)?"square--finish-fx":""}`}>{shownPiece&&<div style={moveStyle} className={`finish-piece${fxClass}${moveClass}${checkClass}${moveClass&&motionFx?.action.promote?" motion-promote":""}`}><Piece piece={shownPiece} perspective={humanSide} promotedOverride={promotedOverride}/></div>}</button>})}</div>{motionFx?.captured&&captureVisual&&(!motionFx.isNanokaShot||motionFx.impactReached)&&<div className={`capture-fly capture-fly--${motionFx.mover}`} style={{left:`${captureVisual[1]*100/6}%`,top:`${captureVisual[0]*100/6}%`,...captureDestination,"--capture-delay":`${motionFx.impactDelay||0}ms`}}><Piece piece={{...motionFx.captured,side:motionFx.capturedOriginalSide,promoted:false}} perspective={humanSide}/></div>}{showNanokaShot&&<svg className="nanoka-shot" viewBox="0 0 600 600" aria-hidden="true"><defs><filter id="nanoka-shot-glow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><line x1={(shotFrom[1]+.5)*100} y1={(shotFrom[0]+.5)*100} x2={(shotTo[1]+.5)*100} y2={(shotTo[0]+.5)*100} pathLength="1"/><circle cx={(shotTo[1]+.5)*100} cy={(shotTo[0]+.5)*100} r="15"/></svg>}{showTryArrow&&<svg className="try-arrow" viewBox="0 0 600 600" aria-hidden="true"><defs><filter id="arrow-glow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><line x1={(tryFrom[1]+.5)*100} y1={(tryFrom[0]+.5)*100} x2={(tryTo[1]+.5)*100} y2={(tryTo[0]+.5)*100} pathLength="1"/></svg>}{endMessage&&<div className={`result-overlay ${endMessage.startsWith("勝利")?"result-overlay--win":"result-overlay--lose"}`} role="status"><div className="result-overlay__panel"><div className="result-overlay__text">{endMessage}</div><div className="result-overlay__actions"><button className="result-overlay__again" onClick={()=>setDifficultyPrompt("rematch")}>もう一回</button><a className="result-overlay__friend" href="https://noplannanoka.booth.pm/items/8824608" target="_blank" rel="noreferrer">友達と対戦したい！</a></div></div></div>}</div></div><p className="board-note">桜羽エマを取られたら負けです。桜羽エマが成ると特殊勝利できます。<br/>エマだけは敵陣最下段、他の駒は敵陣二段目に移動すると魔女化します。<br/>取った駒は打てますが、敵陣最下段には打てません。<br/>長押しで駒の能力を見れます。</p></div>
   <Hand className="hand--player" title="自分の持ち駒" pieces={visibleHand(humanSide)} disabled={state.turn!==humanSide||thinking||motionFx||audioSyncing||gameOver} activeType={handType} onPick={type=>{if(guideTriggered.current){guideTriggered.current=false;return}if(pieceGuide){setPieceGuide(null);return}setHandType(type);setSelected(null)}} perspective={humanSide} onGuideStart={beginPieceGuide} onGuideEnd={endPieceGuide}/>
   <button className="how-to-button" type="button" onClick={()=>setShowHowTo(true)}>How to play</button>
  </main>
  {pieceGuide&&<PieceGuide piece={pieceGuide.piece} onClose={()=>setPieceGuide(null)}/>} 
  {showHowTo&&<HowToPlayDialog onClose={()=>setShowHowTo(false)}/>} 
  {difficultyPrompt&&<DifficultyDialog onChoose={startNewMatch} onCancel={()=>setDifficultyPrompt(null)}/>} 
 </div>;
}
