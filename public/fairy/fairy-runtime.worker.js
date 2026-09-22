let engine=null;
let request=null;
let phase="boot";
let depth=0;
let nodes=0;
let score=0;
let minimum=null;
let started=0;
const input=[];

function appendCommands(commands){
  const bytes=new TextEncoder().encode(commands.join("\n")+"\n");
  for(const byte of bytes)input.push(byte);
}
function emit(type,extra={}){ self.postMessage({type,...extra}); }

function onLine(raw){
  const line=String(raw).trim();
  console.log("[Fairy UCI]",line);
  const d=line.match(/\bdepth (\d+)/),n=line.match(/\bnodes (\d+)/),s=line.match(/\bscore (cp|mate) (-?\d+)/);
  if(d)depth=Math.max(depth,Number(d[1]));
  if(n)nodes=Math.max(nodes,Number(n[1]));
  if(s)score=s[1]==="mate"?(Number(s[2])>0?20000:-20000):Number(s[2]);

  if(line==="readyok"){
    if(request.type==="init"){
      emit("ready");appendCommands(["quit"]);return;
    }
    phase="minimum";depth=0;nodes=0;score=0;started=performance.now();
    appendCommands([`position fen ${request.fen}`,"go depth 7"]);
    return;
  }

  const best=line.match(/^bestmove\s+(\S+)/);
  if(!best)return;
  if(phase==="minimum"){
    minimum={bestmove:best[1],depth,nodes,score};
    const remaining=Math.max(0,Number(request.timeLimitMs||1000)-(performance.now()-started));
    if(remaining>20){
      phase="timed";depth=0;nodes=0;
      appendCommands([
        `position fen ${request.fen}`,
        `go movetime ${Math.round(remaining)} depth ${Math.max(7,Number(request.maxDepth||253))}`,
      ]);
      return;
    }
  }
  const chosen=phase==="timed"&&depth>=7?{bestmove:best[1],depth,nodes,score}:minimum;
  emit("result",{id:request.id,...chosen,elapsed:performance.now()-started});
  appendCommands(["quit"]);
}

self.onmessage=async({data})=>{
  if(request)return;
  request=data;
  try{
    importScripts("./stockfish.js");
    engine=await self.Stockfish({
      locateFile:file=>new URL(file,self.location.href).href,
      onEngineLine:onLine,
      noFSInit:true,
    });
    engine.FS.init(()=>input.length?input.shift():null,null,null);
    appendCommands([
      "uci",
      "setoption name UCI_Variant value magicalshogi",
      "setoption name Hash value 32",
      "isready",
    ]);
    console.log("[Fairy stdin] starting",data.type,"bytes=",input.length);
    engine.callMain([]);
  }catch(error){
    console.error("[Fairy runtime error]",error);
    let message;
    try{message=error?.message?String(error.message):JSON.stringify(error)}catch{message=String(error)}
    emit("error",{id:data.id,message:message||String(error)});
  }
};
