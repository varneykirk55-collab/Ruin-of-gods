const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function mobileSoundCamera(browser) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('file://' + path.resolve(__dirname, '../index.html'));
    await page.locator('#begin').tap();
    await page.locator('#menub').tap();
    await page.locator('#master-volume').press('Home');
    await page.locator('#master-volume').press('ArrowRight');
    await page.waitForFunction(() => __game.audio.output.gain.value.toFixed(2) === '0.01' && __game.audio.musicSource);
    await page.locator('#menub').tap();
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForFunction(() => __game.audio.music.paused && __game.audio.ctx.state === 'suspended');
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.waitForFunction(() => !__game.audio.music.paused && __game.audio.ctx.state === 'running');
    await page.reload();
    await page.locator('#begin').tap();
    assert.equal(await page.locator('#master-volume').inputValue(), '1');
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
    console.log('Mobile master volume, page background/return, settings persistence, safe one-finger rotate and pan passed.');
  } finally { await context.close(); }
};
