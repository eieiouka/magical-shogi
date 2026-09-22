/* Classic worker: loads the official Fairy-Stockfish Emscripten UCI build. */
let engine=null;
let ready=null;
let active=null;
let queued=null;
let sequence=0;

function emit(type,extra={}){self.postMessage({type,...extra})}

function start(){
  if(ready)return ready;
  ready=(async()=>{
    importScripts("./stockfish.js");
    engine=await self.Stockfish({
      locateFile:file=>new URL(file,self.location.href).href,
      onEngineLine:onLine,
    });
    engine.addMessageListener(onLine);
    console.log("[Fairy bridge] before callMain");
    const running=engine.callMain([]);
    console.log("[Fairy bridge] after callMain",running);
    if(running&&typeof running.catch==="function")running.catch(error=>emit("error",{message:error?.message||String(error)}));
    const uciReady=waitFor("uciok");
    engine.postMessage("uci");
    await uciReady;
    engine.postMessage("setoption name UCI_Variant value magicalshogi");
    engine.postMessage("setoption name Hash value 32");
    const engineReady=waitFor("readyok");
    engine.postMessage("isready");
    await engineReady;
    emit("ready");
  })().catch(error=>{emit("error",{message:error?.message||String(error)});throw error});
  return ready;
}

const lineWaiters=[];
function waitFor(exact){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`UCI timeout waiting for ${exact}`)),15000);
    lineWaiters.push({exact,resolve:()=>{clearTimeout(timer);resolve()}});
  });
}
function onLine(raw){
  console.log("[Fairy UCI]",raw);
  const line=String(raw).trim();
  const index=lineWaiters.findIndex(item=>line===item.exact);
  if(index>=0){lineWaiters.splice(index,1)[0].resolve();return}
  if(!active)return;
  const depth=line.match(/\bdepth (\d+)/),nodes=line.match(/\bnodes (\d+)/),score=line.match(/\bscore (cp|mate) (-?\d+)/);
  if(depth)active.depth=Math.max(active.depth,Number(depth[1]));
  if(nodes)active.nodes=Math.max(active.nodes,Number(nodes[1]));
  if(score)active.score=score[1]==="mate"?(Number(score[2])>0?20000:-20000):Number(score[2]);
  const best=line.match(/^bestmove\s+(\S+)/);
  if(best){
    if(active.cancelled){
      const cancelled=active;active=null;
      emit("error",{id:cancelled.id,message:"search superseded"});
      if(queued){const next=queued;queued=null;beginSearch(next)}
      return;
    }
    if(active.phase==="minimum"){
      active.minimum={bestmove:best[1],depth:active.depth,nodes:active.nodes,score:active.score};
      const remaining=active.budget-(performance.now()-active.started);
      if(remaining>20){
        active.phase="timed";active.depth=0;active.nodes=0;active.score=active.minimum.score;
        engine.postMessage(`position fen ${active.fen}`);
        engine.postMessage(`go movetime ${Math.max(1,Math.round(remaining))} depth ${active.maxDepth}`);
        return;
      }
    }
    const done=active;active=null;
    const chosen=done.phase==="timed"&&done.depth>=7
      ?{bestmove:best[1],depth:done.depth,nodes:done.nodes,score:done.score}
      :done.minimum||{bestmove:best[1],depth:done.depth,nodes:done.nodes,score:done.score};
    emit("result",{id:done.id,...chosen,elapsed:performance.now()-done.started});
  }
}

async function search(data){
  await start();
  if(active){queued=data;active.cancelled=true;engine.postMessage("stop");return}
  beginSearch(data);
}

function beginSearch(data){
  const id=data.id??++sequence;
  active={id,fen:data.fen,budget:Math.max(1,Number(data.timeLimitMs||1000)),maxDepth:Math.max(7,data.maxDepth||253),phase:"minimum",minimum:null,depth:0,nodes:0,score:0,started:performance.now(),cancelled:false};
  engine.postMessage(`position fen ${data.fen}`);
  engine.postMessage("go depth 7");
}

self.onmessage=async({data})=>{
  try{
    if(data.type==="init"){await start();return}
    if(data.type==="reset"){
      await start();queued=null;if(active){active.cancelled=true;engine.postMessage("stop")}
      engine.postMessage("ucinewgame");engine.postMessage("isready");return;
    }
    if(data.type==="stop"){if(engine&&active)engine.postMessage("stop");return}
    if(data.type==="search")await search(data);
  }catch(error){emit("error",{id:data.id,message:error?.message||String(error)})}
};
