'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const out=process.env.SHOTS || path.join(__dirname,'../artifacts');
fs.mkdirSync(out,{recursive:true});

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  try {
    const results={};
    for (const [version,file] of [['before',process.env.FRONTIER_BASE_HTML],['after',path.resolve(__dirname,'../index.html')]]) {
      const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
      const page=await ctx.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto('file://'+file);
      await page.locator('#begin').tap();
      const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await page.evaluate(()=>{
        __game.newWorld(1234);
        const c=__game.R.cam;
        Object.assign(c,{dist:72,gdist:72,yaw:0,gyaw:0,pitch:.85,gpitch:.85});
        __game.audio.setMuted(true);
      });
      await frame();
      results[version]=await page.evaluate(async()=>{
        const samples=[];let prev=await new Promise(r=>requestAnimationFrame(r));
        for(let i=0;i<42;i++){
          const now=await new Promise(r=>requestAnimationFrame(r));if(i>=6)samples.push(now-prev);prev=now;
        }
        samples.sort((a,b)=>a-b);
        return {frames:samples.length,avgFps:1000*samples.length/samples.reduce((a,b)=>a+b),medianMs:samples[18],p95Ms:samples[34]};
      });
      console.log('Portrait Chromium SwiftShader',version,results[version]);
      if(version==='after'){
        await page.locator('[data-t="quake"]').tap();
        await page.locator('#pan-btn').tap();
        const touch=await ctx.newCDPSession(page);
        const drag=async()=>{
          await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:565}]});
          for(const y of [510,440,360,290,210]) await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y}]});
          await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        };
        for(let i=0;i<3;i++)await drag();
        assert.ok(await page.evaluate(()=>__game.R.cam.gtz>250 && __game.world.quakes.length===0));
        const zoomBefore=await page.evaluate(()=>__game.R.cam.gdist);
        const pair=span=>[{x:195-span,y:420,id:1},{x:195+span,y:420,id:2}];
        await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pair(28)});
        for(const span of [40,54,68])await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pair(span)});
        await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        assert.ok(await page.evaluate(before=>__game.R.cam.gdist<before && __game.world.quakes.length===0,zoomBefore));
        await page.locator('[data-t="observe"]').tap();
        await page.evaluate(()=>{
          const c=__game.R.cam,v=__game.world.volcano;
          Object.assign(c,{tx:v.x,gtx:v.x,tz:v.z,gtz:v.z,dist:85,gdist:85,pitch:.83,gpitch:.83,yaw:3.4,gyaw:3.4});
        });
        await frame();
        await page.touchscreen.tap(195,422);
        await page.waitForFunction(()=>__game.world.volcano.state==='restless');
        await page.evaluate(()=>{for(let i=0;i<80;i++)__game.world.stepVolcano(.2);});
        await frame();
        assert.ok(await page.evaluate(()=>__game.world.volcano.state==='erupting' && __game.world.lava.size>5));
        await page.screenshot({path:path.join(out,'frontier-portrait.png')});
        await page.setViewportSize({width:844,height:390});await frame();
        await page.screenshot({path:path.join(out,'frontier-landscape.png')});
        assert.equal(await page.evaluate(()=>__game.R.gl.getError()),0);
      }
      assert.deepEqual(errors,[]);await ctx.close();
    }
    fs.writeFileSync(path.join(out,'frontier-performance.json'),JSON.stringify(results,null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
