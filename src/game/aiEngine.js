import {numericBestAction,numericStateKey,numericValue,isNumericTryCritical,createTranspositionTable} from "./numericEngine.js";

export const VALUE_MODEL={weights:[0.24498569584642743,0.06221710139970306,0.06112076322028654,0.07990383193903985,1.3576909371979942,5.01934717042391,0.38731811453190207,0.08835117987230424,-0.46281649395316404,1.0342490629931143,0.3224410859553111,0.23397259407052765,0.6676808729191774],bias:-0.33231912708080835,samples:1352844,revision:27};
export const stateKey=numericStateKey;
export const valueScore=numericValue;
export const winRate=s=>50+50*Math.tanh((valueScore(s)/1000)/4);
export const isTryCritical=isNumericTryCritical;
export const bestAction=numericBestAction;
export {createTranspositionTable};
