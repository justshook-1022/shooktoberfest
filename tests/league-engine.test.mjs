import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleDates,makePairings,calculateResults,splitCents} from '../lib/leagues/engine.ts';
const players=Array.from({length:16},(_,i)=>({id:`p${i}`,name:`Player ${i}`,handicap:i}));
test('schedule preserves dates across daylight saving and rejects impossible dates',()=>{
 assert.deepEqual(scheduleDates('2027-03-01',3,7),['2027-03-01','2027-03-08','2027-03-15']);
 assert.throws(()=>scheduleDates('2027-02-30',2,7));assert.throws(()=>scheduleDates('2027-01-01',53,7));
});
test('draw assigns every available player once, keeps teams within four-player groups, and spaces tee times',()=>{
 const a=makePairings(players,2,'16:00',10,[]);assert.equal(a.length,16);assert.equal(new Set(a.map(x=>x.player_id)).size,16);
 for(let t=1;t<=8;t++){const team=a.filter(x=>x.team===t);assert.equal(team.length,2);assert.equal(new Set(team.map(x=>x.group)).size,1);}
 assert.equal(a[4].time,'16:10');assert.equal(a[15].time,'16:30');
});
test('incomplete teams and midnight overflow fail explicitly',()=>{
 assert.throws(()=>makePairings(players.slice(0,3),2,'16:00',10,[]));assert.throws(()=>makePairings(players,4,'23:55',10,[]));
});
test('tied net scores share position points and preserve every prize cent',()=>{
 const a=[{player_id:'a',name:'A',handicap:10,team:1,group:1,time:'16:00'},{player_id:'b',name:'B',handicap:10,team:2,group:1,time:'16:00'}];
 const r=calculateResults(a,[{team:1,gross:45},{team:2,gross:45}],'average',[10,8],[5001,3000]);
 assert.deepEqual(r.map(x=>x.net),[35,35]);assert.deepEqual(r.map(x=>x.points),[9,9]);assert.deepEqual(r.map(x=>x.place),[1,1]);assert.equal(r.reduce((s,x)=>s+x.prize_cents,0),8001);
 assert.equal(splitCents(5001,2,0)+splitCents(5001,2,1),5001);
});
test('weighted allowances, plus handicaps, and score validation',()=>{
 const a=[{player_id:'a',name:'A',handicap:10,team:1,group:1,time:'16:00'},{player_id:'b',name:'B',handicap:20,team:1,group:1,time:'16:00'}];
 assert.equal(calculateResults(a,[{team:1,gross:40}],'weighted',[10],[0])[0].handicap,7);
 assert.throws(()=>calculateResults(a,[],'average',[10],[0]));assert.throws(()=>calculateResults(a,[{team:1,gross:40.5}],'average',[10],[0]));
});
