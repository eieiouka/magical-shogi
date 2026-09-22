import {bestAction,createTranspositionTable} from "./aiEngine.js";

const sharedTT=createTranspositionTable();
let ponderToken=0;
let deepestPonder=1;
let wasmEngine=null;
const UNBOUNDED_DEPTH=253;
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
  if(data.type==="reset"){sharedTT.clear();wasmEngine?.reset_engine?.();deepestPonder=1;return}
  if(data.type==="ponder"){
    deepestPonder=1;
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
