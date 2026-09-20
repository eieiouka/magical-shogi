import {bestAction,isTryCritical,createTranspositionTable} from "./aiEngine.js";

const sharedTT=createTranspositionTable();
let ponderToken=0;
let deepestPonder=1;

function ponder(state,seen,token,target){
  if(token!==ponderToken)return;
  try{
    const result=bestAction(state,seen,target,{timeLimitMs:180,tt:sharedTT});
    deepestPonder=Math.max(deepestPonder,result?.depth??1);
    if(result?.depth>=target)target+=2;
  }catch{}
  if(token===ponderToken)setTimeout(()=>ponder(state,seen,token,target),0);
}

self.onmessage=({data})=>{
  const token=++ponderToken;
  if(data.type==="reset"){sharedTT.clear();deepestPonder=1;return}
  if(data.type==="ponder"){
    deepestPonder=1;
    const startDepth=isTryCritical(data.state)?9:7;
    setTimeout(()=>ponder(data.state,data.seen,token,startDepth),0);
    return
  }
  try{
    const targetDepth=Math.max(isTryCritical(data.state)?9:7,deepestPonder);
    const result=bestAction(data.state,data.seen,targetDepth,{timeLimitMs:10000,minDepth:5,tt:sharedTT});
    self.postMessage({id:data.id,result});
  }catch(error){self.postMessage({id:data.id,error:error?.message||String(error)})}
};
