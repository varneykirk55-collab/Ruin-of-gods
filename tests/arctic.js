'use strict';
const assert=require('node:assert/strict');
const {World,N,ROWS,ROUTINE}=require('../src/sim');
const Old=require(process.env.ARCTIC_BASE_SIM).World;
let passed=0;
function check(name,fn){fn();passed++;console.log('ok',name);}
const {index,buildings,grid}=require('./legacy_grid');
const old=new Old(1234),w=new World(1234);
check('old grids retain all 320 rows',()=>{for(const k of ['h','h0','w','fuel','kind','tree','bmap','flag'])assert.deepEqual(grid(w[k]).slice(0,320*160),Array.from(old[k]));});
check('old buildings villagers and volcano remain identical',()=>{assert.deepEqual(w.buildings.slice(0,old.buildings.length),buildings(old.buildings));assert.deepEqual(w.npcs.slice(0,old.npcs.length),old.npcs);assert.deepEqual(w.volcano,old.volcano);});
check('Arctic adds two populated villages',()=>{assert.equal(w.tropicalBuildingStart-old.buildings.length,10);assert.equal(w.npcs.filter(n=>n.x<160).length-old.npcs.length,28);});
check('shore joins continuously',()=>{for(let x=0;x<160;x++)assert.ok(Math.abs(w.h[320*N+x]-w.h[319*N+x])<.24);});
check('snow transition has sparse and deep cover',()=>{assert.ok(w.snow.slice(320*N,350*N).some(v=>v>0&&v<100));assert.ok(w.snow.slice(375*N).some(v=>v>170));});
check('frozen lake and open river coexist',()=>{assert.ok(w.ice[w.ci(66,414)]>.4);assert.equal(w.ice[w.ci(42+9*Math.sin(94/24),414)],0);});
const i=w.ci(66,414),snow=w.snow[i],depth=w.w[i];
check('melting releases only stored snow water',()=>{w.meltCell(i,.3);assert.ok(Math.abs(w.w[i]-depth-(snow-w.snow[i])/255*.16)<1e-6);assert.ok(w.ice[i]<.4);});
check('fire melts lake ice',()=>{w.ignite(66,414,1);w.ignite(66,414,1);assert.equal(w.ice[i],0);assert.ok(w.thaw[i]>0);});
check('fracturing exposes liquid without creating water',()=>{w.ice[i]=.4;w.snow[i]=0;const before=w.w[i];w.meltCell(i,1,true);assert.equal(w.ice[i],0);assert.equal(w.w[i],before);assert.ok(w.crack[i]>=100);});
check('quake cuts ice and terrain',()=>{w.ice[i]=.4;const before=w.h[i];w.crackSeg(60,414,72,414,1);assert.equal(w.ice[i],0);assert.ok(w.h[i]<before);});
check('meteor removes snow and ice and creates crater',()=>{const j=w.ci(78,414);w.snow[j]=200;w.ice[j]=.5;const h=w.h[j];w.impact(w.meteor(78,414,.5));assert.equal(w.snow[j],0);assert.equal(w.ice[j],0);assert.ok(w.h[j]<h);});
check('divine finger affects snowy terrain',()=>{const j=w.ci(90,395),h=w.h[j];w.fingerPress(90,395,.8);assert.ok(w.h[j]<h);assert.equal(w.snow[j],0);});
check('Flood adds correct Arctic water volume',()=>{const before=w.w.reduce((a,b)=>a+b,0),volume=w.emitWater(86,400,1,.1);assert.ok(volume>0);assert.ok(Math.abs(w.w.reduce((a,b)=>a+b,0)-before-volume)<.0001);});
check('tornado and lightning work in Arctic',()=>{assert.equal(w.spawnTornado(79,376,.7).z,376);w.lightning(104,431,.6);assert.ok(w.storms.some(s=>s.z===431));});
check('Arctic disaster warnings make residents flee',()=>{const n=w.npcs.at(-1);n.st=ROUTINE;n.inside=false;n.senseT=0;w.addThreat(n.x,n.z,12,5);w.stepNPC(n,.1);assert.ok(n.st!==ROUTINE||n.path);});
const clean=new World(7);clean.spring=[];clean.flag.fill(0);
// Closed basin isolates transport from tides, springs, rain and snowfall.
clean.h.fill(30);clean.w.fill(0);clean.ice.fill(0);clean.snow.fill(0);clean.cold.fill(0);
const c=clean.ci(70,410);for(let z=400;z<420;z++)for(let x=60;x<80;x++){const j=z*N+x;clean.h[j]=2;clean.w[j]=1;clean.cold[j]=255;}
const total=()=>clean.w.reduce((a,b)=>a+b,0),before=total();
check('freezing and melting conserve water in closed basin',()=>{for(let k=0;k<80;k++)clean.stepCold(.5);assert.ok(clean.ice[c]>.4);assert.ok(Math.abs(total()-before)<1e-5);for(let k=0;k<80;k++)clean.flowStep();assert.ok(Math.abs(total()-before)<.001);for(let j=400*N;j<420*N;j++)clean.meltCell(j,1);assert.ok(Math.abs(total()-before)<.001);assert.ok(clean.w.every((v,j)=>v>=0&&clean.ice[j]<=v+1e-6));});
check('snow regrows and heat suppresses recovery',()=>{clean.snow[c]=0;clean.w[c]=0;clean.thaw[c]=0;for(let k=0;k<8;k++)clean.stepCold(.5);assert.ok(clean.snow[c]>0);clean.meltCell(c,1);for(let k=0;k<8;k++)clean.stepCold(.5);assert.equal(clean.snow[c],0);});
check('lava melts ice and snow and preserves cooling',()=>{clean.w[c]=1;clean.ice[c]=.7;clean.snow[c]=120;clean.lava.set(c,2);clean.stepVolcano(.2);assert.equal(clean.ice[c],0);assert.equal(clean.snow[c],0);assert.ok(clean.basalt[c]);});
check('blizzard stays localized',()=>{w.blizzard.remaining=25;w.blizzard.phase=5;assert.ok(w.blizzardAt(w.blizzard.x,w.blizzard.z)>.9);assert.equal(w.blizzardAt(w.vc.x,w.vc.z),0);assert.equal(w.blizzardAt(w.blizzard.x+40,w.blizzard.z),0);});
check('frozen hazards excluded from navigation',()=>{assert.equal(w.passCost(i,i-N),-1);assert.ok(w.findPath(w.ci(73,373),w.ci(82,376)).length>0);});
check('all thermal state and active disasters roundtrip',()=>{const s=JSON.parse(JSON.stringify(w.serialize())),r=World.load(s);for(const k of ['snow','ice','thaw','basalt'])assert.deepEqual(r[k],w[k]);assert.deepEqual(r.blizzard,w.blizzard);assert.deepEqual(r.volcano,w.volcano);assert.equal(r.buildings.length,w.buildings.length);assert.equal(r.npcs.length,w.npcs.length);assert.equal(r.storms.length,w.storms.length);});
check('damaged v3 save retains shelters NPCs water lava and volcano',()=>{const b=old.addB('tent',130,113,true,[1,0],true);assert.ok(b);old.npcs[0].home=b.id;old.npcs[1].hp=.56;old.h[1234]-=2;old.w[1234]+=1;old.volcano.state='erupting';old.volcano.remaining=12;old.lava.set(old.ci(110,276),2);const r=World.load(JSON.parse(JSON.stringify(old.serialize())));assert.equal(r.buildings[r.npcs[0].home].type,'tent');assert.equal(r.buildings[r.npcs[0].home].x,130);assert.equal(r.npcs[1].hp,.56);assert.ok(Math.abs(r.h[index(1234)]-old.h[1234])<.006);assert.equal(r.w[index(1234)],old.w[1234]);assert.deepEqual(r.volcano,old.volcano);assert.deepEqual([...r.lava],[...old.lava].map(([i,v])=>[index(i),v]));});
check('Arctic inhabitants move under existing AI',()=>{const town=new World(1234),residents=town.npcs.slice(old.npcs.length).filter(n=>n.x<160);const positions=residents.map(n=>[n.x,n.z]);for(let k=0;k<600;k++)town.tick(1/60);assert.ok(residents.some((n,j)=>Math.hypot(n.x-positions[j][0],n.z-positions[j][1])>1));assert.ok(residents.every(n=>n.z>=320&&Number.isFinite(n.x)));});
console.log(passed,'Arctic checks passed; world',N,ROWS,'above sea',w.h.filter(v=>v>0).length,'old',old.h.filter(v=>v>0).length);
