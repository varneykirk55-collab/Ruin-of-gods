'use strict';
const assert=require('node:assert/strict');
const {World,N}=require('../src/sim');
const Old=require(process.env.LAVA_BASE_SIM).World;
let passed=0;
function check(label,test){test();passed++;console.log('ok',label);}
const w=new World(1234);
check('invalid pours leave world unchanged',()=>{for(const args of [[NaN,50,1,.1],[50,50,Infinity,.1],[-2,50,1,.1],[50,50,1,-1]])assert.equal(w.emitLava(...args),0);assert.equal(w.lava.size,0);});
check('intensity increases source width and output',()=>{const low=w.emitLava(70,190,.1,.1),small=w.lava.size;w.lava.clear();const high=w.emitLava(70,190,1,.1);assert.ok(high>low&&w.lava.size>small);assert.ok(Math.abs([...w.lava.values()].reduce((a,b)=>a+b,0)-high)<1e-8);});
check('lava source stays inside the world at boundaries',()=>{w.lava.clear();w.emitLava(1,1,1,.1);assert.ok([...w.lava.keys()].every(i=>i>=0&&i<N*480));});
w.lava.clear();w.w.fill(0);w.ice.fill(0);w.snow.fill(0);w.h.fill(10);w.basalt.fill(0);
const center=w.ci(70,190);w.lava.set(center,10);w.stepVolcano(.2);
check('flow fans to eight neighbours with conserved transfer',()=>{assert.equal(w.lava.size,9);assert.ok(Math.abs([...w.lava.values()].reduce((a,b)=>a+b,0)-(10-9*.009))<1e-6);assert.ok([...w.lava.values()].every(v=>v>0));});
check('flow prefers downhill terrain',()=>{w.lava.clear();w.h.fill(30);w.h[center]=10;w.h[center+N]=8;w.lava.set(center,1);w.stepVolcano(.2);assert.ok(w.lava.has(center+N));assert.ok(!w.lava.has(center-1));});
check('water quenches poured lava faster',()=>{w.lava.clear();w.h.fill(-20);const dry=w.ci(30,190),wet=w.ci(50,190);w.lava.set(dry,1);w.lava.set(wet,1);w.w[wet]=2;w.stepVolcano(.2);assert.ok(w.lava.get(wet)<w.lava.get(dry));});
check('player lava persists through save and load',()=>{const r=World.load(JSON.parse(JSON.stringify(w.serialize())));assert.deepEqual([...r.lava],[...w.lava]);assert.deepEqual(r.basalt,w.basalt);});
const results={};
for(const [name,Type]of [['before',Old],['after',World]]){
 const world=new Type(1234);world.wakeVolcano();while(world.volcano.state!=='erupting')world.stepVolcano(.2);const duration=world.volcano.remaining;
 let peak=0;const start=performance.now();for(let k=0;k<600;k++){world.stepVolcano(.2);peak=Math.max(peak,world.lava.size);}
 const scars=[];world.basalt.forEach((v,i)=>{if(v)scars.push(i);});results[name]={duration,peak,cells:scars.length,width:Math.max(...scars.map(i=>i%(name==='before'?160:N)))-Math.min(...scars.map(i=>i%(name==='before'?160:N)))+1,ms:performance.now()-start};
}
check('eruption lasts longer, spreads wider and covers more land',()=>{assert.equal(results.after.duration,90);assert.ok(results.after.cells>results.before.cells*3);assert.ok(results.after.width>results.before.width*3);assert.ok(results.after.peak<5000);});
console.log(JSON.stringify(results));console.log(passed,'lava checks passed');
