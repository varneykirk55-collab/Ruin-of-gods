'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 fs.mkdirSync('artifacts',{recursive:true});
 try{for(const mobile of [true,false]){
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto('file://'+path.resolve('index.html'));await page.locator('#begin').click();
  await page.evaluate(()=>{__game.newWorld(1234);__game.audio.setMuted(true);__game.world.time=.45;const c=__game.R.cam;Object.assign(c,{tx:213,gtx:213,tz:309,gtz:309,dist:mobile?154:122,gdist:mobile?154:122,pitch:1,gpitch:1,yaw:0,gyaw:0});});
  await page.waitForTimeout(1000);
  assert.ok(await page.evaluate(()=>{const h=__game.R.pick(0,0,__game.world);return h&&h.x>160&&Math.abs(h.z-309)<3;}));
  await page.screenshot({path:'artifacts/tropical-'+(mobile?'portrait':'desktop')+'.png'});
  // Pan across the old edge with actual pointer / touch inputs.
  await page.evaluate(()=>{const c=__game.R.cam;Object.assign(c,{tx:153,gtx:153,tz:282,gtz:282,dist:100,gdist:100});});
  await page.locator('[data-t="quake"]').click();
  await page.locator('#pan-btn').click();
  if(mobile){const cdp=await ctx.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:305,y:420}]});for(const x of [260,210,160,110,60])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:420}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else {await page.mouse.move(900,400);await page.mouse.down();await page.mouse.move(250,400,{steps:10});await page.mouse.up();}
  assert.ok(await page.evaluate(()=>__game.R.cam.gtx>160));
  await page.locator('[data-t="lava"]').click();
  // Clicking the selected camera mode returns to casting.
  if(await page.locator('#pan-btn').getAttribute('aria-pressed')==='true')await page.locator('#pan-btn').click();
  await page.evaluate(()=>{const c=__game.R.cam;Object.assign(c,{tx:217,gtx:217,tz:280,gtz:280,dist:66,gdist:66});});
  await page.waitForTimeout(500);
  if(mobile)await page.touchscreen.tap(195,422);else await page.mouse.click(640,400);
  await page.waitForFunction(()=>[...__game.world.lava.keys()].some(i=>i%288>=160));
  assert.equal(await page.evaluate(()=>__game.R.gl.getError()),0);assert.deepEqual(errors,[]);
  console.log((mobile?'Portrait touch':'Desktop mouse')+' tropical rendering, navigation and Lava passed');await ctx.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
