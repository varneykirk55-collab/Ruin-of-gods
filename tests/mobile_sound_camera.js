const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function mobileSoundCamera(browser) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    // Serve the local build under a single origin, as on Netlify. Audio routed
    // from an opaque file URL would be silent regardless of the volume setting.
    const origin = 'https://valley.test';
    await page.route(origin + '/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/') return route.fulfill({ path: path.join(__dirname,'../index.html'), contentType:'text/html' });
      if (/^\/assets\/music\/track-[1-4]\.mp3$/.test(pathname)) {
        return route.fulfill({ path: path.join(__dirname,'..',pathname), contentType:'audio/mpeg' });
      }
      return route.fulfill({ status:404 });
    });
    await page.addInitScript(() => {
      if (!localStorage.getItem('ruin-sound')) localStorage.setItem('ruin-sound', '{"volume":0.6}');
    });
    await page.goto(origin);
    await page.locator('#begin').tap();
    await page.locator('#menub').tap();
    assert.equal(await page.locator('#music-volume').inputValue(), '60');
    assert.equal(await page.locator('#effects-volume').inputValue(), '60');
    await page.locator('#music-volume').press('Home');
    const gains = () => page.evaluate(() => [__game.audio.musicGain, __game.audio.effectsGain].map(node => Number(node.gain.value.toFixed(3))));
    assert.deepEqual(await gains(), [0, 0.6]);
    await page.locator('#effects-volume').press('End');
    assert.deepEqual(await gains(), [0, 1]);
    await page.locator('#music-volume').press('End');
    await page.locator('#effects-volume').press('Home');
    assert.deepEqual(await gains(), [0.25, 0]);
    await page.locator('#menub').tap();
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForFunction(() => __game.audio.music.paused && __game.audio.ctx.state === 'suspended');
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.waitForFunction(() => !__game.audio.music.paused && __game.audio.ctx.state === 'running');
    await page.reload();
    await page.locator('#begin').tap();
    assert.equal(await page.locator('#music-volume').inputValue(), '100');
    assert.equal(await page.locator('#effects-volume').inputValue(), '0');
    await page.locator('[data-t="quake"]').tap();
    const drag = () => page.evaluate(() => {
      const canvas = document.getElementById('c');
      for (const [type,x,y] of [['pointerdown',360,155],['pointermove',460,182],['pointerup',460,182]]) {
        canvas.dispatchEvent(new PointerEvent(type,{pointerId:73,pointerType:'touch',clientX:x,clientY:y,bubbles:true}));
      }
    });
    await page.locator('#orbit-btn').tap();
    const yaw = await page.evaluate(() => __game.R.cam.gyaw);
    await drag();
    assert.ok(Math.abs(await page.evaluate(() => __game.R.cam.gyaw) - yaw) > 0.4);
    await page.locator('#pan-btn').tap();
    const position = () => page.evaluate(() => [__game.R.cam.gtx,__game.R.cam.gtz]);
    const before = await position();
    await drag();
    assert.notDeepEqual(await position(),before);
    assert.equal(await page.evaluate(() => __game.world.quakes.length),0);
    assert.equal(await page.evaluate(() => __game.tool),'quake');
    assert.deepEqual(errors,[]);
    console.log('Separate mobile volumes, page background/return, settings persistence, safe one-finger rotate and pan passed.');
  } finally { await context.close(); }
};
