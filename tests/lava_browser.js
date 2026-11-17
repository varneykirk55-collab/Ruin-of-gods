'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 fs.mkdirSync('artifacts',{recursive:true});
 try{for(const mobile of [true,false]){
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto('file://'+path.resolve('index.html'));await page.locator('#begin').click();
  await page.evaluate(()=>{__game.newWorld(1234);__game.audio.setMuted(true);const c=__game.R.cam;Object.assign(c,{tx:87,gtx:87,tz:210,gtz:210,dist:70,gdist:70,pitch:.95,gpitch:.95,yaw:.4,gyaw:.4});});
  if(mobile)await page.locator('[data-t="lava"]').tap();else await page.keyboard.press('9');
  assert.equal(await page.evaluate(()=>__game.tool),'lava');
  const box=await page.locator('[data-t="lava"]').boundingBox();assert.ok(box.width>=44&&box.height>=44);
  const x=mobile?195:640,y=mobile?422:360;
  if(mobile){const cdp=await ctx.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(850);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else {await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(850);await page.mouse.up();}
  await page.waitForFunction(()=>__game.world.lava.size>4);
  const active=await page.evaluate(()=>({pose:__game.R.hand.pose,cells:__game.world.lava.size}));assert.ok(active.cells>4);
  await page.screenshot({path:'artifacts/lava-'+(mobile?'portrait':'desktop')+'.png'});
  if(mobile){await page.locator('#pan-btn').tap();const before=await page.evaluate(()=>[...__game.world.lava.values()].reduce((a,b)=>a+b,0));await page.touchscreen.tap(x,y);const after=await page.evaluate(()=>[...__game.world.lava.values()].reduce((a,b)=>a+b,0));assert.ok(after<=before+.001);}
  assert.equal(await page.evaluate(()=>__game.R.gl.getError()),0);assert.deepEqual(errors,[]);console.log((mobile?'Portrait touch':'Desktop keyboard and mouse')+' Lava power passed');await ctx.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
