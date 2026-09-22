import assert from "node:assert/strict";
import {makeInitialState} from "../src/game/rules.js";
import {fairyMoveToAction,stateToFairyFen} from "../src/game/fairyCodec.js";

const initial=makeInitialState();
assert.equal(stateToFairyFen(initial),"mskihn/6/6/6/6/NHIKSM[-] w - - 0 1");
assert.deepEqual(fairyMoveToAction(initial,"c1b1").magic,"居合切り");

const blank=()=>({...makeInitialState(),board:Array.from({length:6},()=>Array(6).fill(null)),hands:{sente:[],gote:[]},turn:"sente"});

const shot=blank();
shot.board[5][0]={id:"n",type:"nanoka",side:"sente",promoted:true};
shot.board[3][0]={id:"x",type:"margo",side:"gote",promoted:false};
assert.deepEqual(fairyMoveToAction(shot,"a1a3"),{
  piece:shot.board[5][0],from:[5,0],to:[3,0],promote:false,
  category:"magic",magic:"銃撃",captureAt:[3,0],movePiece:false
});

const jump=blank();
jump.board[3][2]={id:"m",type:"margo",side:"sente",promoted:false};
jump.board[3][3]={id:"x",type:"sherry",side:"gote",promoted:false};
assert.equal(fairyMoveToAction(jump,"c3e3").magic,"跳躍暗殺");
assert.deepEqual(fairyMoveToAction(jump,"c3e3").captureAt,[3,3]);

const float=blank();
float.board[5][1]={id:"h",type:"hanna",side:"sente",promoted:true};
assert.equal(fairyMoveToAction(float,"b1b3").magic,"浮遊");

const drop=blank();
drop.hands.sente.push({id:"held",type:"sherry",side:"sente",promoted:false});
assert.deepEqual(fairyMoveToAction(drop,"S@c3").to,[3,2]);

console.log("Fairy codec tests passed");
