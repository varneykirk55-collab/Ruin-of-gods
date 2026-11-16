'use strict';
const { World, N, NN, K, ROUTINE, PANIC, STUMBLE, SHAKEN, DEAD } = require('../src/sim.js');
const assert = require('node:assert/strict');
function rngMaker(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let checks = 0;
const check=(name,condition)=>{assert.ok(condition,name); checks++; console.log('ok '+name);};
const run = (w,seconds) => {for(let i=0;i<seconds*60;i++)w.tick(1/60);};
// Isolated closed basin: sources and sea exchange are intentionally disabled.
(function() {

const w=Object.create(World.prototype);
for(const k of ['h','w','dw','flow','flx','flz'])w[k]=new Float32Array(NN);
w.flag=new Uint8Array(NN);w.spring=[];
for(let z=0;z<N;z++)for(let x=0;x<N;x++)w.h[z*N+x]=5+Math.abs(x-80)*0.4+Math.abs(z-80)*0.4;
const before=w.h.slice(),sum=()=>w.w.reduce((a,b)=>a+b,0);let added=0;
for(let t=0;t<600;t++){if(t<120)added+=w.emitWater(65,80,1,1/60);for(let j=0;j<3;j++)w.flowStep();}
const volume=sum(),tests=[['emission and ordinary flow conserve volume',Math.abs(volume-added)<0.002],['terrain unchanged',w.h.every((v,i)=>v===before[i])],['flows downhill into valley',w.w[80*N+80]>1],['nonnegative water',w.w.every(v=>v>=0)]];
for(let i=0;i<120;i++)w.flowStep();
tests.push(['persists after emission stops',Math.abs(sum()-volume)<0.002]);
const prev=sum();w.emitWater(65,80,1,0.1);tests.push(['repeat adds water',sum()>prev+29.99]);
for(const [name,condition] of tests)check(name,condition);

})();
(function() {

const w=new World(1234);w.rnd=rngMaker(42);w.rainT=1e9;const tests=[];
const b=w.buildings.find(b=>b.type==='house'), neighbor=w.buildings.find(o=>o!==b&&o.type==='house');
for(const p of b.parts)if(p.role==='sup')p.hp=0.15;
const roof=b.parts.find(p=>p.role==='roof'), hp=roof.hp;
for(let i=0;i<120;i++)w.tickB(b,1/60);
tests.push(['weak supports progressively weaken roof',roof.hp<hp]);
b.wet=1.5;b.fire=1;const chars=b.parts.map(p=>p.char);
w.tickB(b,1/60);
tests.push(['flood extinguishes building before burning',b.fire===0&&b.parts.every((p,i)=>p.char===chars[i])]);
const i=w.ci(40,90);w.w[i]=1;w.fuel[i]=1;
tests.push(['submerged fuel cannot ignite',!w.igniteCell(i)]);
w.w[i]=0;w.igniteCell(i);w.w[i]=1;w.stepFire(0.1);
tests.push(['flood extinguishes ground fire',w.burn[i]===0]);
const t=w.spawnTornado(neighbor.x,neighbor.z,1), hp0=neighbor.parts.reduce((a,p)=>a+p.hp,0);
for(let j=0;j<60;j++){t.x=neighbor.x;t.z=neighbor.z;w.stepTornado(t,1/60);}
tests.push(['tornado progressively damages structures',neighbor.parts.reduce((a,p)=>a+p.hp,0)<hp0],['tornado moves debris',w.debris.some(d=>d.vy>0)]);
const center=w.ci(60,90),h=w.h[center];w.impact({x:60,z:90,I:0.5});
const crater=w.h[center];w.emitWater(60,90,1,0.1);w.flowStep();
tests.push(['meteor crater persists and accepts water',crater<h-2&&w.h[center]===crater&&w.w[center]>0],['meteor leaves fires and scorch',w.fires.length>0&&w.scorch[center]===255]);
for(const [name,condition] of tests)check(name,condition);

})();
(function() {

const w=new World(1234);w.rnd=rngMaker(7);w.rainT=1e9;const tests=[];
const n=w.npcs[0];n.inside=false;n.st=ROUTINE;n.x=110;n.z=100;
const ci=w.ci(n.x,n.z);w.w[ci]=1;w.wb[ci]=1;
tests.push(['standing deep water remains a threat',!!w.dangerAt(n)]);
w.w[ci]=0;w.wb[ci]=0;
w.threats=[];w.tornados=[];w.meteors=[];w.addThreat(15,15,5,2);
tests.push(['distant threat does not cause panic',!w.dangerAt(n)]);
w.threats=[];w.addThreat(n.x,n.z,8,3);w.rebuildHazards();
tests.push(['danger map represents proximity',w.hazards[ci]>.9&&w.hazards[w.ci(20,20)]===0],['danger excluded from safe destinations',!w.safeCell(ci)]);
const flat=w.ci(130,120);w.h[flat]=w.h[flat+1]=5;w.w[flat]=w.w[flat+1]=0;w.bmap[flat]=w.bmap[flat+1]=0;w.burn[flat]=w.burn[flat+1]=0;
n.x=130;n.z=120;n.path=[flat+1];n.pi=0;n.jx=n.jz=0;w.w[flat+1]=1;
tests.push(['newly flooded path invalidates immediately',w.move(n,3,1/60)===-1&&n.path===null]);
n.st=PANIC;n.calm=1.7;n.tx=110;n.tz=100;n.tr=8;n.hp=.63;
w.w[ci]=75.123;const saved=w.serialize(),copy=World.load(JSON.parse(JSON.stringify(saved)));
tests.push(['water roundtrip preserves deep volume',copy.w[ci]===w.w[ci]],['panic state and timer survive save/load',copy.npcs[0].st===PANIC&&copy.npcs[0].calm===1.7],['active hazards survive save/load',copy.threats.length===1&&copy.hazards[ci]>.9]);
let calls=0;w.fx.sound=()=>calls++;w.screamT=0;for(let i=0;i<40;i++)w.panicSound(100,100,.7);
tests.push(['panic audio is rate limited',calls===1]);
for(const [name,condition] of tests)check(name,condition);

})();
(function(){

const w=new World(1234),b=w.buildings.find(b=>b.type==='house');
const h=w.h.slice(),water=w.w.slice(),neighbor=w.buildings.find(o=>o!==b&&o.type==='house'),hp=JSON.stringify(neighbor.parts);
const target=w.queryDelete(b.x,b.y+30,b.z,0,-1,0,b.x,b.z,0);
check('deletion ray selects intended building',target&&target.b===b);
w.applyDelete(target);
check('deletion removes collision',b.cells.every(i=>w.bmap[i]!==b.id+1));
check('deletion leaves neighboring structure unchanged',JSON.stringify(neighbor.parts)===hp);
check('deletion spawns no debris',w.debris.length===0);
check('deletion preserves terrain and water',w.h.every((v,i)=>v===h[i])&&w.w.every((v,i)=>v===water[i]));
const ti=w.tree.findIndex(v=>v===1),n=w.npcs[0];w.eraseTree(ti);w.eraseNPC(n);w.eraseWell();
const w2=World.load(JSON.parse(JSON.stringify(w.serialize())));
check('all deleted object types persist',w2.buildings[b.id].gone&&w2.tree[ti]===0&&w2.npcs[n.id].erased&&w2.well.gone);
check('essential world systems cannot be targeted',w.applyDelete({kind:'world'})===false);

})();
(function(){

const w=new World(1234),n=w.npcs[0],tests=[];w.rnd=rngMaker(5);w.rainT=1e9;
for(let z=130;z<150;z++)for(let x=130;x<150;x++){const i=z*N+x;w.h[i]=5;w.w[i]=0;w.burn[i]=0;w.bmap[i]=0;}
n.x=140;n.z=140;n.inside=false;n.st=SHAKEN;n.t=0;n.senseT=1;w.alarm=22;
w.stepNPC(n,1/60);
tests.push(['safe survivor returns to routine despite distant alarm',n.st===ROUTINE&&n.hp>0]);
n.st=PANIC;n.hp=.05;w.w[w.ci(n.x,n.z)]=3;w.stepNPC(n,1);
tests.push(['severe flooding can kill trapped NPC',n.st===DEAD]);
for(const [name,condition] of tests)check(name,condition);

})();
console.log(checks+' disaster survival checks passed');
