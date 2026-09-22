import {bestAction,createTranspositionTable} from "./aiEngine.js";
import {fairyMoveToAction,stateToFairyFen} from "./fairyCodec.js";

const sharedTT=createTranspositionTable();
let ponderToken=0;
let deepestPonder=1;
let wasmEngine=null;
let fairyWorker=null;
let fairySequence=0;
const fairyPending=new Map();
const UNBOUNDED_DEPTH=253;
const fairyReady=(async()=>{
  try{
    const engineUrl=new URL("/fairy/stockfish.js",self.location.origin);
    const response=await fetch(engineUrl,{method:"HEAD",cache:"no-store"});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const contentType=response.headers.get("content-type")||"";
    if(!/javascript|ecmascript/.test(contentType))throw new Error("Fairy-Stockfish artifact is not built");
    fairyWorker=new Worker(new URL("/fairy/fairy-bridge.worker.js?v=worker-v23",self.location.origin));
    fairyWorker.onmessage=({data})=>{
      if(data.type==="ready"){fairyPending.get("ready")?.resolve();fairyPending.delete("ready");return}
      if(data.type==="error"&&data.id==null&&fairyPending.has("ready")){
        fairyPending.get("ready").reject(new Error(data.message));fairyPending.delete("ready");return;
      }
      const pending=fairyPending.get(data.id);
      if(!pending)return;
      if(data.type==="error")pending.reject(new Error(data.message));
      else if(data.type==="result")pending.resolve(data);
      else return;
      fairyPending.delete(data.id);
    };
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Fairy-Stockfish startup timeout")),15000);
      fairyPending.set("ready",{resolve:()=>{clearTimeout(timer);resolve()},reject});
      fairyWorker.postMessage({type:"init"});
    });
    console.info("[魔法将棋AI] Fairy-Stockfish WASM loaded");
    return true;
  }catch(error){
    fairyWorker?.terminate();fairyWorker=null;
    console.info("[魔法将棋AI] Fairy-Stockfish unavailable; use existing engine",error?.message||error);
    return false;
  }
})();
const wasmReady=(async()=>{
  try{
    const url=new URL("./wasm/magical_shogi_engine.js",import.meta.url).href;
    const module=await import(/* @vite-ignore */url);
    await module.default();
    wasmEngine=module;
    console.info(`[魔法将棋AI] WASM loaded: ${module.engine_version?.()??"unknown"}`);
  }catch(error){wasmEngine=null;console.error("[魔法将棋AI] WASM load failed; JavaScript fallback",error)}
})();

async function runEngine(state,seen,target,timeLimitMs,minDepth,selectiveDepth=0,log=true){
  if(await fairyReady){
    if(log)console.info(`[魔法将棋AI] search start engine=fairy-stockfish minDepth=15 budget=${timeLimitMs}ms`);
    const id=++fairySequence;
    const result=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{fairyPending.delete(id);reject(new Error("Fairy-Stockfish search timeout"))},Math.max(120000,timeLimitMs+10000));
      fairyPending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});
      fairyWorker.postMessage({type:"search",id,fen:stateToFairyFen(state),timeLimitMs,maxDepth:target});
    });
    return {action:fairyMoveToAction(state,result.bestmove),score:result.score,depth:result.depth,nodes:result.nodes,engine:"fairy-stockfish",proven:Math.abs(result.score)>=19000};
  }
  await wasmReady;
  if(wasmEngine){
    if(log)console.info(`[魔法将棋AI] search start engine=wasm mode=iterative-lmr maxDepth=${target} minDepth=${minDepth} budget=${timeLimitMs}ms`);
    try{return wasmEngine.best_action(state,target,minDepth,timeLimitMs,selectiveDepth)}catch(error){console.error("[魔法将棋AI] WASM search failed; JavaScript fallback",error)}
  }
  if(log)console.info(`[魔法将棋AI] search start engine=javascript maxDepth=${target} minDepth=${minDepth} budget=${timeLimitMs}ms`);
  return bestAction(state,seen,target,{timeLimitMs,minDepth,tt:sharedTT});
}

async function ponder(state,seen,token){
  if(token!==ponderToken)return;
  try{
    const result=await runEngine(state,seen,UNBOUNDED_DEPTH,180,3,0,false);
    deepestPonder=Math.max(deepestPonder,result?.depth??1);
  }catch{}
  if(token===ponderToken)setTimeout(()=>ponder(state,seen,token),0);
}

self.onmessage=async({data})=>{
  const token=++ponderToken;
  if(data.type==="reset"){sharedTT.clear();wasmEngine?.reset_engine?.();fairyWorker?.postMessage({type:"reset"});deepestPonder=1;return}
  if(data.type==="ponder"){
    deepestPonder=1;
    if(await fairyReady)return;
    setTimeout(()=>ponder(data.state,data.seen,token),0);
    return
  }
  try{
    const targetDepth=UNBOUNDED_DEPTH;
    const timeLimitMs=Math.max(500,data.timeLimitMs??500);
    const startedAt=performance.now();
    const result=await runEngine(data.state,data.seen,targetDepth,timeLimitMs,7,0);
    const elapsed=Math.max(1,performance.now()-startedAt);
    const nps=result?.nodes?Math.round(result.nodes*1000/elapsed):"?";
    console.info(`[魔法将棋AI] engine=${result?.engine??"javascript"} depth=${result?.depth??"?"} nodes=${result?.nodes??"?"} elapsed=${Math.round(elapsed)}ms nps=${nps}`);
    self.postMessage({id:data.id,result});
  }catch(error){self.postMessage({id:data.id,error:error?.message||String(error)})}
};
