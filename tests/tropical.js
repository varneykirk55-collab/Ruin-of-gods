'use strict';
const assert=require('node:assert/strict');
const {World,N}=require('../src/sim');
const {index,buildings,grid}=require('./legacy_grid');
const Old=require(process.env.TROPICAL_BASE_SIM).World;
let passed=0;function check(name,fn){fn();console.log('ok',name);passed++;}
const old=new Old(1234),w=new World(1234);
check('all old cells stay identical at their world coordinates',()=>{for(const k of ['h','h0','w','fuel','tree','kind','flag','snow','ice'])assert.deepEqual(grid(w[k]),Array.from(old[k]),k);});
check('existing settlements and residents preserved',()=>{assert.deepEqual(w.buildings.slice(0,old.buildings.length),buildings(old.buildings));assert.deepEqual(w.npcs.slice(0,old.npcs.length),old.npcs);});
check('two populated tropical villages and warm palms',()=>{assert.equal(w.buildings.length-old.buildings.length,10);assert.equal(w.npcs.length-old.npcs.length,28);let trees=0,land=0;for(let z=0;z<480;z++)for(let x=160;x<N;x++){const i=z*N+x;trees+=w.tree[i]===1;land+=w.h[i]>0;assert.equal(w.cold[i]+w.snow[i]+w.ice[i],0);}assert.ok(trees>300&&land>8000);});
check('lagoon and freshwater pool contain water',()=>{assert.ok(w.w[w.ci(243,304)]>.5);assert.ok(w.w[w.ci(211,251)]>.5);});
check('old ocean edge joins with no terrain seam',()=>{for(let z=0;z<480;z++)assert.equal(w.h[w.ci(159,z)],w.h[w.ci(160,z)]);});
check('old saves remap damage water ice lava and tent references',()=>{const b=old.addB('tent',130,113,true,[1,0],true);assert.ok(b);old.npcs[0].home=b.id;old.quake(70,100,95,120,.8);old.h[1234]-=2;old.w[1234]+=1;old.lava.set(old.ci(110,276),2);old.snow[old.ci(80,400)]=123;const r=World.load(JSON.parse(JSON.stringify(old.serialize())));assert.ok(Math.abs(r.h[index(1234)]-old.h[1234])<.006);assert.equal(r.w[index(1234)],old.w[1234]);assert.equal(r.snow[r.ci(80,400)],123);assert.equal(r.buildings[r.npcs[0].home].type,'tent');assert.deepEqual([...r.lava],[...old.lava].map(([i,v])=>[index(i),v]));assert.equal(r.npcs.length,w.npcs.length);assert.deepEqual(r.quakes[0].ci,old.quakes[0].ci.map(index));});
check('flood flows across the former east boundary',()=>{const r=new World(1234);r.flag.fill(0);r.spring=[];r.h.fill(10);r.w.fill(0);const i=r.ci(159,280);r.w[i]=1;for(let k=0;k<8;k++)r.flowStep();assert.ok(r.w[i+1]>.01);});
check('tropical powers alter the shared simulation',()=>{const i=w.ci(220,260),h=w.h[i];w.fingerPress(220,260,.8);assert.ok(w.h[i]<h);assert.ok(w.emitWater(220,260,1,.1)>0);assert.ok(w.emitLava(220,260,1,.1)>0);w.stepVolcano(.2);assert.ok(w.basalt[i]);w.lightning(217,280,.6);assert.ok(w.storms.length);assert.equal(w.spawnTornado(217,280,.5).x,217);});
check('new saves retain tropical damage and residents',()=>{const r=World.load(JSON.parse(JSON.stringify(w.serialize())));assert.equal(r.w.length,w.w.length);assert.deepEqual(r.w,w.w);assert.deepEqual(r.tree,w.tree);assert.deepEqual([...r.lava],[...w.lava]);assert.equal(r.npcs.length,w.npcs.length);});
check('tropical residents move and retain valid work coordinates',()=>{const r=new World(1234),ns=r.npcs.slice(old.npcs.length),start=ns.map(n=>[n.x,n.z]);for(let k=0;k<600;k++)r.tick(1/60);assert.ok(ns.some((n,i)=>Math.hypot(n.x-start[i][0],n.z-start[i][1])>1));assert.ok(ns.every(n=>Number.isFinite(n.wx)&&Number.isFinite(n.wz)&&n.x>=160));});
console.log(passed,'tropical checks passed');
