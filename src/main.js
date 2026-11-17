'use strict';
// ===================== GOD SIM — input, HUD, game loop =====================
(function () {
  const $ = id => document.getElementById(id);
  const canvas = $('c'), STEP = 1 / 60, KEY = 'godsim.save.v1';
  const TAP_SLOP = 11, TOUCH_HOLD_MS = 65;

  const ICONS = {
    observe: '<svg viewBox="0 0 24 24" fill="none"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" fill="#fff" stroke="#1b76ad" stroke-width="2"/><circle cx="12" cy="12" r="3.4" fill="#2d9cdb"/><circle cx="12" cy="12" r="1.5" fill="#1b3042"/><circle cx="13.1" cy="10.9" r=".8" fill="#fff"/></svg>',
    quake: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 19L9.5 6l4 6.5L16.5 9 21 19H3z" fill="#b7824c" stroke="#5a3b1e" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 7l-1.8 4.2 2.4 2.1L10.8 19" stroke="#ff6b35" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    flood: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 15c2.2-2.8 4.5-4.5 7.5-4.5 2.3 0 3.2 1.8 1.6 2.8-1 .6-2 .1-2-.9 2.6-1.2 5.4.6 7.4 2.6 1.2 1.2 2.2 1.5 3.5 1.5v3.5H3v-5z" fill="#2d9cdb" stroke="#165c87" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 19.5c2.5 1.2 5 1.2 7.5 0s5-1.2 8.5 0" stroke="#9be2ff" stroke-width="1.8" stroke-linecap="round"/></svg>',
    meteor: '<svg viewBox="0 0 24 24" fill="none"><path d="M19.5 4.5L11 10l3 3 5.5-8.5z" fill="#ffd166" stroke="#e65c00" stroke-width="1.5" stroke-linejoin="round"/><path d="M15 3.5L9.5 8.5M20.5 9l-5 5.5" stroke="#ff6b35" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="15" r="5" fill="#ff7b29" stroke="#7d2b06" stroke-width="1.8"/><circle cx="7.6" cy="13.6" r="1.4" fill="#ffd166"/></svg>',
    finger: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 4h6v7.5l2.2.8a2 2 0 0 1 1.3 1.9V17a4 4 0 0 1-4 4h-3.6a4 4 0 0 1-3.6-2.2L5.5 15a1.6 1.6 0 0 1 2.7-1.7L9 14.4V4z" fill="#ffd2a6" stroke="#7a4924" stroke-width="1.8" stroke-linejoin="round"/><path d="M10.5 19.5h3" stroke="#ff6b35" stroke-width="2" stroke-linecap="round"/></svg>',
    fire: '<svg viewBox="0 0 24 24" fill="none"><path d="M12.5 3c.5 3.5-2.5 5-2.5 8 0 1.4.9 2.4 2 2.4 1.6 0 2.5-1.6 2-3.8 2.8 1.6 4.5 4.3 4.5 7 0 3.2-2.9 5.4-6.5 5.4S5.5 19.8 5.5 16.4C5.5 11.4 9 7 12.5 3z" fill="#ff6b35" stroke="#8c2303" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 13.5c1.5 1.1 2.5 2.4 2.5 4a2.5 2.5 0 0 1-5 0c0-1.6 1-2.9 2.5-4z" fill="#ffe066"/></svg>',
    lightning: '<svg viewBox="0 0 24 24" fill="none"><path d="M13.5 2.5L5.5 13h5.5l-1.5 8.5L18.5 11H13l.5-8.5z" fill="#ffd93d" stroke="#b36b00" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    tornado: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M6 10h12M8 14h8M10 18h4M11.5 21h1.5" stroke="#4f6d7a" stroke-width="2.4" stroke-linecap="round"/><path d="M7 6c1 2 10 2 11 0M8 10c1 1.6 7 1.6 8 0" stroke="#8ab4c4" stroke-width="1.5" stroke-linecap="round"/></svg>',
  };

  const SND_ON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
  const SND_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>';

  const TOOLS = [
    { id: 'observe', short: 'Observe', name: 'Observe', hint: 'Drag to pan. Tap or click a villager to follow them.' },
    { id: 'quake', short: 'Quake', name: 'Earthquake', hint: 'Drag a fault line across the land, then release.' },
    { id: 'flood', short: 'Flood', name: 'Flood', hint: 'Tap or drag to pour water downhill across the valley.' },
    { id: 'meteor', short: 'Meteor', name: 'Meteor', hint: 'Tap or click to call down a meteor.' },
    { id: 'finger', short: 'Finger', name: 'Divine Finger', hint: 'Hold or drag to press the land flat.' },
    { id: 'fire', short: 'Fire', name: 'Firestorm', hint: 'Tap or drag to set the land alight. Fire follows the wind.' },
    { id: 'lightning', short: 'Bolt', name: 'Lightning', hint: 'Tap or click to unleash a storm of lightning.' },
    { id: 'tornado', short: 'Tornado', name: 'Tornado', hint: 'Tap to touch down a tornado; move or drag to steer it.' },
  ];

  let R, world, audio = new AudioEngine(), tool = 'observe', intensity = 0.6, paused = false, speed = 1, started = false, memSave = null;
  let last = 0, acc = 0, frameN = 0, hudT = 0, follow = false, lastHour = -1;
  let orbitMode = false, panMode = false, statsUserSet = false, rotateDismissed = false;
  let canvasRect = { left: 0, top: 0, width: 1, height: 1 };
  const mouse = { nx: 0, ny: 0, px: 0, py: 0, down: false, mode: '', hit: null, moved: 0, inside: false };
  const keys = {}; const ptrs = new Map();
  let gest = null, gestLock = false, pending = null;
  let qStart = null, lastCarve = null, fireT = 0, fing = { ph: 0, t: 0, x: 0, z: 0, cd: 0 };
  const fps = { n: 0, acc: 0, ms: 16, fps: 60, worst: 16 };
  const mix = { wind: 0, river: 0, fire: 0, quake: 0, rain: 0, flood: 0, village: 0, day: 1, calm: true, near: 1 };
  const prevHud = { pop: -1, inj: -1, dead: -1, hl: -1, bs: -1, bt: -1, fires: -1, mood: '', clock: '', windDeg: 999, warn: null, selId: -1, selSt: '', selJob: '', selHp: -1 };

  function isCompact() { return window.innerWidth < 900 || window.innerHeight < 520; }
  function isSingleTapTool(t) { return t === 'meteor' || t === 'lightning'; }
  function isMenuOpen() { return $('sys-actions').classList.contains('open'); }
  function isHelpOpen() { return $('help').classList.contains('show'); }
  function isModalOpen() { return !started || isMenuOpen() || isHelpOpen(); }

  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600); }
  function log(m) { const l = $('log'), d = document.createElement('div'); d.textContent = m; l.appendChild(d); while (l.children.length > 5) l.removeChild(l.firstChild); setTimeout(() => d.classList.add('old'), 7000); setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 11000); }
  function flash(a) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = 'opacity 1.4s ease-out'; f.style.opacity = 0; }); }
  function sfx(name, x, z, v) { const c = R.cam, d = Math.hypot(x - c.tx, z - c.tz), a = clamp(1.25 - d / (c.dist * 1.1 + 45), 0.06, 1); audio.play(name, v * a); }

  function updateCanvasRect() {
    const r = canvas.getBoundingClientRect();
    canvasRect = { left: r.left, top: r.top, width: Math.max(1, r.width), height: Math.max(1, r.height) };
  }

  function syncLayout() {
    updateCanvasRect();
    const compact = isCompact();
    if (!compact && isMenuOpen()) setMenuOpen(false);
    if (!statsUserSet) setStatsCollapsed(compact, false);
    const portraitSmall = window.innerHeight > window.innerWidth && window.innerWidth < 600;
    $('rotate-tip').classList.toggle('show', portraitSmall && !rotateDismissed && started);
    if (R) R.resize();
  }

  function setStatsCollapsed(collapsed, userTriggered) {
    if (userTriggered) statsUserSet = true;
    $('stats').classList.toggle('collapsed', !!collapsed);
    $('stats-toggle').setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  function clearPending() {
    if (pending && pending.timer) clearTimeout(pending.timer);
    pending = null;
  }

  function cancelPointer() {
    clearPending();
    ptrs.clear();
    gest = null;
    gestLock = false;
    mouse.down = false;
    mouse.mode = '';
    mouse.inside = false;
    qStart = null;
    lastCarve = null;
    if (world) { world.finger = null; world.steer = null; }
    canvas.style.cursor = (tool === 'observe' || panMode) ? 'grab' : 'crosshair';
  }

  function setMenuOpen(open) {
    const acts = $('sys-actions'), bd = $('menu-backdrop'), mb = $('menub');
    if (open) { cancelPointer(); $('bar').classList.remove('inten-open'); }
    acts.classList.toggle('open', !!open);
    bd.classList.toggle('show', !!open);
    mb.classList.toggle('on', !!open);
    mb.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function setHelpOpen(open) {
    if (open) { setMenuOpen(false); cancelPointer(); $('bar').classList.remove('inten-open'); }
    $('help').classList.toggle('show', !!open);
  }

  function setPanMode(on, orbit = false) {
    orbitMode = !!on && orbit;
    panMode = !!on && (orbitMode || tool !== 'observe');
    $('pan-btn').classList.toggle('on', panMode && !orbitMode);
    $('pan-btn').setAttribute('aria-pressed', panMode && !orbitMode);
    $('orbit-btn').classList.toggle('on', orbitMode);
    $('orbit-btn').setAttribute('aria-pressed', orbitMode);
    canvas.style.cursor = (tool === 'observe' || panMode) ? 'grab' : 'crosshair';
    if (panMode) qStart = null;
  }

  function bindWorld(w) {
    world = w; R.sel = null; follow = false; qStart = null;
    w.fx = { burst: (t, x, y, z, n, s, p) => R.parts.burst(t, x, y, z, n, s, p), sound: sfx, shake: a => { R.cam.shake = Math.max(R.cam.shake, Math.min(1.7, a)); }, flash, log };
    w.terrDirty = true; w.staticDirty = true;
    prevHud.pop = -1;
  }

  function setTool(id) {
    if (!TOOLS.some(entry => entry.id === id)) return;
    tool = id; qStart = null;
    setPanMode(false);
    for (const b of document.querySelectorAll('#tools button')) {
      const active = b.dataset.t === id;
      b.classList.toggle('on', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (active) {
        const tb = $('tools');
        if (tb.scrollWidth > tb.clientWidth) {
          const targetLeft = b.offsetLeft - (tb.clientWidth - b.offsetWidth) / 2;
          try { tb.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' }); } catch (_) { tb.scrollLeft = Math.max(0, targetLeft); }
        }
      }
    }
    const t = TOOLS.find(t => t.id === id);
    $('hint').textContent = t.hint;
    canvas.style.cursor = id === 'observe' ? 'grab' : 'crosshair';
    const showInt = id !== 'observe';
    $('inten').style.visibility = showInt ? 'visible' : 'hidden';
    $('dock-extra').classList.toggle('show', showInt);
    $('pan-btn').classList.toggle('show', showInt);
    if (!showInt) $('bar').classList.remove('inten-open');
    audio.play('ui', 1);
  }

  function setSpeed(s) {
    speed = s; paused = s === 0;
    for (const b of document.querySelectorAll('#speed button')) b.classList.toggle('on', +b.dataset.s === s);
  }

  // ------------------------------------------------------------ save / load
  function hasSave() { try { if (localStorage.getItem(KEY)) return true; } catch (e) { } return !!memSave; }
  function save() {
    const c = R.cam, s = JSON.stringify({ world: world.serialize(), cam: [c.gtx, c.gtz, c.gyaw, c.gpitch, c.gdist] });
    memSave = s; let ok = false; try { localStorage.setItem(KEY, s); ok = true; } catch (e) { }
    toast(ok ? 'World saved — it will be here when you come back' : 'Saved for this session only (browser storage is unavailable here)');
  }
  function load() {
    let s = null; try { s = localStorage.getItem(KEY); } catch (e) { }
    s = s || memSave; if (!s) { toast('No saved world yet'); return false; }
    try {
      const d = JSON.parse(s); bindWorld(World.load(d.world));
      const c = R.cam;
      if (d.cam) { c.gtx = d.cam[0]; c.gtz = d.cam[1]; c.gyaw = d.cam[2]; c.gpitch = d.cam[3]; c.gdist = d.cam[4]; }
      R.parts.n = 0; toast('Saved world restored'); return true;
    } catch (e) { console.error(e); toast('That save could not be read'); return false; }
  }
  function newWorld(seed) {
    bindWorld(new World(seed || ((Math.random() * 1e9) | 0)));
    const c = R.cam; c.gtx = c.tx = world.vc.x; c.gtz = c.tz = world.vc.z;
    c.gdist = 62; c.gpitch = 0.72; c.gyaw = 0.5; R.parts.n = 0;
  }

  // ------------------------------------------------------------ input
  function setMouse(e) {
    const r = canvasRect;
    mouse.px = e.clientX - r.left; mouse.py = e.clientY - r.top;
    mouse.nx = mouse.px / r.width * 2 - 1; mouse.ny = 1 - mouse.py / r.height * 2;
    mouse.inside = true;
  }
  function setMouseCoords(clientX, clientY) {
    const r = canvasRect;
    mouse.px = clientX - r.left; mouse.py = clientY - r.top;
    mouse.nx = mouse.px / r.width * 2 - 1; mouse.ny = 1 - mouse.py / r.height * 2;
    mouse.inside = true;
  }
  function pan(dx, dy, touch = false) {
    const c = R.cam, s = c.gdist * (touch ? 1.15 / Math.min(canvasRect.width, canvasRect.height) : 0.0019), cy = Math.cos(c.gyaw), sy = Math.sin(c.gyaw);
    c.gtx = clamp(c.gtx + (-dx * cy - dy * sy) * s, 2, N - 3);
    c.gtz = clamp(c.gtz + (dx * sy - dy * cy) * s, 2, N - 3);
    follow = false;
  }
  function beginAction() {
    const h = mouse.hit = R.pick(mouse.nx, mouse.ny, world);
    if (!h) return;
    R.hand.cast(h);
    if (tool === 'quake') qStart = { x: h.x, z: h.z };
    else if (tool === 'flood') { world.emitWater(h.x, h.z, intensity, 0.1); lastCarve = { x: h.x, z: h.z }; }
    else if (tool === 'meteor') world.meteor(h.x, h.z, intensity);
    else if (tool === 'lightning') world.lightning(h.x, h.z, intensity);
    else if (tool === 'tornado') world.spawnTornado(h.x, h.z, intensity);
    else if (tool === 'fire') fireT = 0;
  }
  function endAction() { if (tool === 'quake' && qStart) { const h = mouse.hit; if (h) world.quake(qStart.x, qStart.z, h.x, h.z, intensity); qStart = null; } lastCarve = null; }

  function trySelect(radius) {
    let best = radius || 30, bn = null;
    const r = canvasRect;
    for (const n of world.npcs) {
      if (n.inside || (n.st === DEAD && n.deadT >= 999)) continue;
      const p = R.project(n.x, n.y + 0.4, n.z);
      if (p[2] <= 0) continue;
      const d = Math.hypot((p[0] + 1) / 2 * r.width - mouse.px, (1 - p[1]) / 2 * r.height - mouse.py);
      if (d < best) { best = d; bn = n; }
    }
    R.sel = bn; follow = !!bn;
    if (bn) R.cam.gdist = Math.min(R.cam.gdist, 26);
  }

  function promotePendingToAct(curX, curY) {
    if (!pending) return;
    const p = pending;
    clearPending();
    mouse.mode = 'act';
    mouse.down = true;
    mouse.nx = p.nx; mouse.ny = p.ny;
    mouse.inside = true;
    beginAction();
    if (curX !== undefined && curY !== undefined) {
      setMouseCoords(curX, curY);
    }
  }

  function startTwoFingerGesture() {
    clearPending();
    if (mouse.mode === 'act') {
      qStart = null; lastCarve = null;
    }
    mouse.down = false;
    mouse.mode = 'gest';
    gestLock = true;
    const p = [...ptrs.values()];
    gest = {
      d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y),
      a: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x),
      cx: (p[0].x + p[1].x) / 2,
      cy: (p[0].y + p[1].y) / 2
    };
  }

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.target !== canvas || isModalOpen()) return;
    $('bar').classList.remove('inten-open');
    audio.start();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (e.pointerType === 'touch') {
      if (ptrs.size >= 2) { startTwoFingerGesture(); return; }
      if (gestLock) return;
      setMouse(e);
      mouse.moved = 0;
      if (tool === 'observe' || panMode) {
        mouse.down = true;
        mouse.mode = orbitMode ? 'rot' : 'pan';
        canvas.style.cursor = 'grabbing';
        return;
      }
      mouse.down = false;
      mouse.mode = 'pending';
      const p = { id: e.pointerId, sx: e.clientX, sy: e.clientY, nx: mouse.nx, ny: mouse.ny, t: performance.now(), timer: null };
      pending = p;
      if (!isSingleTapTool(tool)) {
        p.timer = setTimeout(() => {
          if (pending === p && mouse.mode === 'pending' && ptrs.size === 1 && !gestLock && !isModalOpen()) {
            const cur = ptrs.get(p.id);
            if (tool === 'tornado' && world.tornados.length > 0) {
              clearPending();
              mouse.mode = 'act'; mouse.down = true; mouse.inside = true;
              if (cur) setMouseCoords(cur.x, cur.y);
            } else {
              promotePendingToAct(cur ? cur.x : p.sx, cur ? cur.y : p.sy);
            }
          }
        }, TOUCH_HOLD_MS);
      }
      return;
    }

    if (ptrs.size > 1) return;
    setMouse(e);
    mouse.down = true; mouse.moved = 0;
    if (e.button === 2 || (orbitMode && e.button === 0)) mouse.mode = 'rot';
    else if (e.button === 1 || e.shiftKey || tool === 'observe' || panMode) mouse.mode = 'pan';
    else { mouse.mode = 'act'; beginAction(); }
    if (mouse.mode === 'pan') canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', e => {
    if (isModalOpen()) return;
    const p = ptrs.get(e.pointerId), dx = p ? e.clientX - p.x : 0, dy = p ? e.clientY - p.y : 0;
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (mouse.mode === 'gest' && ptrs.size >= 2 && gest) {
      const q = [...ptrs.values()];
      const d = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y);
      const a = Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x);
      const cx = (q[0].x + q[1].x) / 2, cy = (q[0].y + q[1].y) / 2;
      const c = R.cam;
      if (gest.d > 10 && d > 10) c.gdist = clamp(c.gdist * (gest.d / d), 7, 230);
      let da = a - gest.a;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > 0.004) c.gyaw -= da;
      pan(cx - gest.cx, cy - gest.cy, true);
      gest = { d, a, cx, cy };
      return;
    }
    if (e.pointerType === 'touch' && gestLock) return;

    setMouse(e);
    if (mouse.mode === 'pending' && pending && e.pointerId === pending.id) {
      const dist = Math.hypot(e.clientX - pending.sx, e.clientY - pending.sy);
      mouse.moved = dist;
      if (dist > TAP_SLOP) {
        if (isSingleTapTool(tool)) {
          const px = pending.sx, py = pending.sy;
          clearPending();
          mouse.down = true;
          mouse.mode = 'pan';
          pan(e.clientX - px, e.clientY - py, true);
        } else if (tool === 'tornado' && world.tornados.length > 0) {
          clearPending();
          mouse.down = true;
          mouse.mode = 'act';
          mouse.inside = true;
        } else {
          promotePendingToAct(e.clientX, e.clientY);
        }
      }
      return;
    }

    if (!mouse.down) return;
    mouse.moved += Math.abs(dx) + Math.abs(dy);
    if (mouse.mode === 'rot') {
      const sensitivity = e.pointerType === 'touch' ? Math.PI / Math.min(canvasRect.width, canvasRect.height) : 0.006;
      R.cam.gyaw -= dx * sensitivity;
      R.cam.gpitch = clamp(R.cam.gpitch + dy * sensitivity * 0.8, 0.3, 1.45);
    }
    else if (mouse.mode === 'pan') pan(dx, dy, e.pointerType === 'touch');
  });

  const up = e => {
    ptrs.delete(e.pointerId);
    const isTouch = e.pointerType === 'touch';
    if (mouse.mode === 'gest') {
      if (ptrs.size < 2) { gest = null; mouse.mode = ''; }
      if (ptrs.size === 0) { gestLock = false; if (isTouch) { mouse.inside = false; } }
      return;
    }
    if (isTouch && ptrs.size === 0) gestLock = false;

    if (mouse.mode === 'pending' && pending && e.pointerId === pending.id) {
      const p = pending;
      clearPending();
      if (e.type === 'pointerup' && !isModalOpen()) {
        mouse.nx = p.nx; mouse.ny = p.ny; mouse.inside = true;
        mouse.down = true; mouse.mode = 'act';
        beginAction();
        mouse.hit = R.pick(mouse.nx, mouse.ny, world);
        endAction();
      }
      mouse.down = false; mouse.mode = '';
      if (isTouch) { mouse.inside = false; }
      return;
    }

    if (!mouse.down) {
      if (isTouch && ptrs.size === 0) { mouse.inside = false; }
      return;
    }
    mouse.down = false;
    if (mouse.mode === 'act') {
      if (e.type === 'pointercancel') { qStart = null; lastCarve = null; }
      else endAction();
    } else if (mouse.mode === 'pan' && tool === 'observe' && !panMode && mouse.moved < (isTouch ? 12 : 6)) {
      trySelect(isTouch ? 44 : 30);
    }
    mouse.mode = '';
    if (isTouch && ptrs.size === 0) { mouse.inside = false; }
    canvas.style.cursor = (tool === 'observe' || panMode) ? 'grab' : 'crosshair';
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch' && !mouse.down) mouse.inside = false; });
  canvas.addEventListener('wheel', e => {
    if (isModalOpen()) return;
    e.preventDefault();
    R.cam.gdist = clamp(R.cam.gdist * Math.exp(e.deltaY * 0.0012), 7, 230);
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (!started) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (isMenuOpen()) { setMenuOpen(false); return; }
      if (isHelpOpen()) { setHelpOpen(false); return; }
      if ($('bar').classList.contains('inten-open')) { $('bar').classList.remove('inten-open'); return; }
      R.sel = null; follow = false; qStart = null;
      return;
    }
    if (k === 'h' || k === '?') { setHelpOpen(!isHelpOpen()); return; }
    if (isMenuOpen() || isHelpOpen()) return;
    keys[k] = true;
    if (/^[1-8]$/.test(k)) setTool(TOOLS[+k - 1].id);
    else if (k === ' ' || k === 'p') { setSpeed(paused ? 1 : 0); e.preventDefault(); }
    else if (k === '[') setInt(intensity - 0.1);
    else if (k === ']') setInt(intensity + 0.1);
    else if (k === 'm') toggleMute();
    if (k.startsWith('arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  function backgroundAudio() { cancelPointer(); audio.setBackground(true); }
  function restoreAudio() { if (!document.hidden) audio.setBackground(false); }
  document.addEventListener('visibilitychange', () => document.hidden ? backgroundAudio() : restoreAudio());
  window.addEventListener('pagehide', backgroundAudio);
  window.addEventListener('pageshow', restoreAudio);
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; backgroundAudio(); });
  window.addEventListener('focus', restoreAudio);
  window.addEventListener('resize', syncLayout);
  window.addEventListener('orientationchange', () => setTimeout(syncLayout, 60));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncLayout);
    window.visualViewport.addEventListener('scroll', updateCanvasRect);
  }

  function setInt(v) {
    intensity = clamp(v, 0.1, 1);
    const pct = Math.round(intensity * 100);
    $('rng').value = pct;
    $('rv').textContent = pct + '%';
    $('rv-mini').textContent = pct + '%';
  }
  function syncMuteUI() {
    const svg = audio.muted ? SND_OFF_SVG : SND_ON_SVG;
    const lbl = audio.muted ? 'Sound off' : 'Sound on';
    $('mute').innerHTML = svg + '<span class="menu-only">' + lbl + '</span>';
    $('mute-quick').innerHTML = svg;
    $('mute').setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
    $('mute-quick').setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
  }
  function saveSoundSettings() {
    try { localStorage.setItem('ruin-sound', JSON.stringify({ volume: audio.volume, muted: audio.muted })); } catch (_) {}
  }
  function toggleMute() { audio.setMuted(!audio.muted); syncMuteUI(); saveSoundSettings(); }

  function keyCam(dt) {
    const c = R.cam, s = c.gdist * 0.9 * dt; let f = 0, r = 0;
    if (keys.w || keys.arrowup) f += 1; if (keys.s || keys.arrowdown) f -= 1;
    if (keys.d || keys.arrowright) r += 1; if (keys.a || keys.arrowleft) r -= 1;
    if (f || r) { const cy = Math.cos(c.gyaw), sy = Math.sin(c.gyaw); c.gtx += (-sy * f + cy * r) * s; c.gtz += (-cy * f - sy * r) * s; follow = false; }
    if (keys.q) c.gyaw += dt * 1.4; if (keys.e) c.gyaw -= dt * 1.4;
    if (keys.r) c.gpitch += dt * 0.8; if (keys.f) c.gpitch -= dt * 0.8;
    if (keys['='] || keys['+']) c.gdist *= 1 - dt * 1.2; if (keys['-']) c.gdist *= 1 + dt * 1.2;
    if (follow && R.sel) { c.gtx = R.sel.x; c.gtz = R.sel.z; }
  }

  // ------------------------------------------------------------ powers held down (per sim tick)
  function toolTick(dt) {
    const h = mouse.hit, act = mouse.down && mouse.mode === 'act';
    world.finger = (tool === 'finger' && !panMode && h && (mouse.inside || act)) ? { x: h.x, z: h.z, r: 3.5 + 2.4 * intensity } : null;
    world.steer = (tool === 'tornado' && !panMode && h && (mouse.inside || act)) ? { x: h.x, z: h.z, strong: !!act } : null;
    if (tool === 'flood' && act && h) {
      const a = lastCarve || h, d = Math.hypot(h.x - a.x, h.z - a.z), n = Math.min(240, Math.max(1, Math.ceil(d)));
      for (let k = 1; k <= n; k++) world.emitWater(a.x + (h.x - a.x) * k / n, a.z + (h.z - a.z) * k / n, intensity, dt / n);
      lastCarve = { x: h.x, z: h.z };
    }
    if (tool === 'fire' && act && h) { fireT -= dt; if (fireT <= 0) { world.ignite(h.x, h.z, intensity); fireT = 0.22; } }
    if (fing.cd > 0) fing.cd -= dt;
    if (fing.ph === 0) { if (tool === 'finger' && act && h && fing.cd <= 0) { fing.ph = 1; fing.t = 0; fing.x = h.x; fing.z = h.z; } }
    else if (fing.ph === 1) { fing.t += dt / 0.16; if (fing.t >= 1) { world.fingerPress(fing.x, fing.z, intensity); fing.ph = 2; fing.t = 0; } }
    else { fing.t += dt / 0.32; if (fing.t >= 1) { fing.ph = 0; fing.cd = 0.08; } }
  }

  function extraDraw(B, P) {
    const h = mouse.hit;
    if (tool === 'quake' && qStart && h) {
      const d = Math.hypot(h.x - qStart.x, h.z - qStart.z), n = Math.max(2, Math.ceil(d / 1.2));
      for (let k = 0; k <= n; k++) { const x = qStart.x + (h.x - qStart.x) * k / n, z = qStart.z + (h.z - qStart.z) * k / n; B.push(x, world.hAt(x, z) + 0.25, z, 0.5, 0.18, 0.5, 0, k, 0, 1, 0.35, 0.15, 1); }
    }
  }

  function marker() {
    const h = mouse.hit, m = R.mark, c = R.markC;
    if (!h || tool === 'observe' || panMode || (!mouse.inside && !mouse.down)) { c[3] = 0; return; }
    m[0] = h.x; m[1] = h.z; c[3] = 0.75;
    if (tool === 'quake') { m[2] = 1.2; c[0] = 1; c[1] = 0.5; c[2] = 0.2; }
    else if (tool === 'flood') { m[2] = 1.2 + 1.3 * intensity; c[0] = 0.3; c[1] = 0.7; c[2] = 1; }
    else if (tool === 'meteor') { m[2] = 4 + 7 * intensity; c[0] = 1; c[1] = 0.25; c[2] = 0.15; }
    else if (tool === 'finger') { m[2] = 1.6 + 2.4 * intensity; c[0] = 1; c[1] = 0.9; c[2] = 0.75; }
    else if (tool === 'lightning') { m[2] = 5 + 9 * intensity; c[0] = 0.6; c[1] = 0.75; c[2] = 1; }
    else if (tool === 'tornado') { m[2] = 3.2 + 5.5 * intensity; c[0] = 0.72; c[1] = 0.78; c[2] = 0.84; }
    else { m[2] = 1.5 + 4 * intensity; c[0] = 1; c[1] = 0.55; c[2] = 0.1; }
  }

  // ------------------------------------------------------------ continuous effects
  function emitFx(dt) {
    const P = R.parts, w = world, rnd = Math.random, k = dt * 60, F = w.fires;
    if (F.length) { const n = Math.min(70, 4 + F.length * 0.08) * k; for (let q = 0; q < n; q++) { const i = F[(rnd() * F.length) | 0], x = i % N, z = (i / N) | 0, t = w.tree[i] === 2, y = w.h[i] + (t ? 0.6 + rnd() * 1.4 : 0.2); P.burst('fire', x, y, z, 1, 0.5, t ? 1.3 : 0.8); if (rnd() < 0.3) P.burst('smoke', x, y + 0.8, z, 1, 0.4, 1); if (rnd() < 0.06) P.burst('ember', x, y + 1, z, 1, 0.3, 1); } }
    for (const b of w.buildings) if (b.fire > 0 && rnd() < 0.9 * k) { const x = b.x + (rnd() - .5) * b.w, z = b.z + (rnd() - .5) * b.d; P.burst('fire', x, b.y + b.hgt * (0.4 + rnd() * 0.8), z, 2, 0.4, 1.2 + b.fire); if (rnd() < 0.5) P.burst('smoke', x, b.y + b.hgt + 1, z, 1, 0.5, 1.4); if (rnd() < 0.15) P.burst('ember', x, b.y + b.hgt, z, 1, 0.5, 1); }
    for (const m of w.meteors) { P.burst('fire', m.px, m.py, m.pz, 5, 0.6 + m.I, 1.5); P.burst('smoke', m.px, m.py, m.pz, 1, 0.5, 0.6); P.burst('spark', m.px, m.py, m.pz, 1, 0.5, 0.6); }
    for (const s of w.storms) if (s.t < 3.2) { const gy = Math.max(0, w.hAt(s.x, s.z)); P.burst('cloud', s.x, gy + 44, s.z, Math.ceil(2 * k), s.R * 1.3, 1); if (s.t < 0.5) P.burst('spark', s.x + (rnd() - .5) * 4, gy + 0.5, s.z + (rnd() - .5) * 4, 1, 1, 0.4); }
    for (const bo of w.bolts) if (bo.ttl > bo.T - 0.3) { for (let q = 0; q < 6; q++) { const g = bo.segs[(rnd() * bo.segs.length) | 0], t = rnd(); P.burst('glow', g[0] + (g[3] - g[0]) * t, g[1] + (g[4] - g[1]) * t, g[2] + (g[5] - g[2]) * t, 1, (bo.main ? 4 : 2) + rnd() * 2, 1); } if (bo.ttl > bo.T - 0.05) P.burst('glow', bo.x, bo.y + 0.5, bo.z, 1, bo.main ? 18 : 8, 1); }
    for (const e of w.emitters) if (rnd() < 0.5 * k) P.burst('smoke', e.x, w.hAt(e.x, e.z) + 0.5, e.z, 1, e.r, 1.3);
    for (const q of w.quakes) if (rnd() < 0.85 * k) { const p = q.pts[(rnd() * Math.max(1, q.done)) | 0]; P.burst('dust', p[0], w.hAt(p[0], p[1]) + 0.35, p[1], 2, 2.8, 1); }
    for (const t of w.tornados) { const gy = w.hAt(t.x, t.z), n = Math.min(10, 3 + t.I * 4); P.burst('swirl', t.x, gy + 1.2 + rnd() * (6 + t.I * 6), t.z, n, t.R * (0.35 + rnd() * 0.5), 0.8 + t.I); if (rnd() < 0.8) P.burst('dust', t.x, gy + 0.4, t.z, 2, t.R * 0.45, 0.8); }
    const c = R.cam;
    if (w.rain > 0) { const rr = Math.min(60, c.dist * 0.7 + 8); P.burst('rain', c.tx, Math.max(0, w.hAt(c.tx, c.tz)) + 9, c.tz, (40 * k) | 0, rr, 1); }
    for (const cp of w.camps) if (!cp.dead && rnd() < 0.5 * k) P.burst('fire', cp.x, w.hAt(cp.x, cp.z) + 0.3, cp.z, 1, 0.12, 0.45);
    for (let q = 0; q < 14 * k; q++) { const x = (c.tx + (rnd() - .5) * (c.dist + 20)) | 0, z = (c.tz + (rnd() - .5) * (c.dist + 20)) | 0; if (x < 1 || z < 1 || x > N - 2 || z > N - 2) continue; const i = z * N + x; if (w.flow[i] > 0.035 && w.w[i] > 0.15 && w.w[i] - w.wb[i] > 0.12) P.burst('splash', x, w.h[i] + w.w[i], z, 1, 0.5, 0.7); }
    for (const n of w.npcs) if (n.onFire > 0 && n.st !== DEAD && rnd() < 0.5) P.burst('fire', n.x, n.y + 0.5, n.z, 1, 0.15, 0.5);
  }

  function audioMix(dt) {
    const w = world, c = R.cam, rad = c.dist * 0.6 + 14; let riv = 0, fl = 0, cnt = 0;
    for (let k = 0; k < 28; k++) { const a = k * 2.4, r = rad * Math.sqrt((k + 0.5) / 28), x = Math.round(c.tx + Math.cos(a) * r), z = Math.round(c.tz + Math.sin(a) * r); if (x < 0 || z < 0 || x >= N || z >= N) continue; const i = z * N + x; cnt++; if (w.w[i] > 0.1 && !(w.flag[i] & 2)) { riv += Math.min(1, w.flow[i] * 40); fl += Math.min(1, Math.max(0, w.w[i] - w.wb[i]) * w.flow[i] * 80); } }
    let fire = 0; const F = w.fires, st = Math.max(1, (F.length / 300) | 0), R2 = (rad + 25) * (rad + 25); for (let k = 0; k < F.length; k += st) { const i = F[k], dx = i % N - c.tx, dz = ((i / N) | 0) - c.tz; if (dx * dx + dz * dz < R2) fire += st; }
    for (const b of w.buildings) if (b.fire > 0 && Math.hypot(b.x - c.tx, b.z - c.tz) < rad + 25) fire += 30;
    let qk = 0; for (const q of w.quakes) qk = Math.max(qk, q.I * Math.sin(Math.PI * Math.min(1, q.t / q.dur)));
    let tn = 0; for (const t of w.tornados) { const d = Math.hypot(t.x - c.tx, t.z - c.tz); tn = Math.max(tn, (0.35 + 0.65 * t.I) * clamp(1.35 - d / (t.R * 2 + c.dist * 0.45 + 8), 0, 1)); }
    let vil = 0; for (const n of w.npcs) if (n.st !== DEAD && !n.inside && Math.hypot(n.x - c.tx, n.z - c.tz) < rad + 10) vil++;
    const near = clamp(1.2 - c.dist / 160, 0.1, 1), el = Math.sin((w.time - 0.25) * 6.2832);
    mix.river = clamp(riv / Math.max(1, cnt) * 2.2, 0, 1) * near; mix.flood = clamp(fl / Math.max(1, cnt) * 3, 0, 1); mix.fire = clamp(fire / 220, 0, 1) * (0.4 + 0.6 * near); mix.quake = qk; mix.rain = w.rain > 0 ? 1 : 0; mix.wind = Math.max(w.windS * (0.4 + c.dist / 230), tn); mix.tornado = tn; mix.village = clamp(vil / 14, 0, 1) * near; mix.day = sstep(-0.1, 0.2, el); mix.calm = w.alarm <= 0 && tn < 0.2; mix.near = near;
    audio.mix(mix); audio.ambient(dt, mix);
    const hr = Math.floor(w.time * 24); if (hr !== lastHour) { if ((hr === 12 || hr === 18 || hr === 6) && lastHour >= 0) { const ch = w.buildings.find(b => b.type === 'church'); if (ch && !ch.ruin) sfx('bell', ch.x, ch.z, 0.9); } lastHour = hr; }
  }

  // ------------------------------------------------------------ HUD (cached DOM updates)
  function hud() {
    const s = world.stats(), t = world.time * 24, hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
    let bFires = 0;
    for (let i = 0; i < world.buildings.length; i++) if (world.buildings[i].fire > 0) bFires++;
    const totalFires = s.fires + bFires;
    const clock = 'Day ' + world.day + ' · ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + (world.rain > 0 ? ' · rain' : '');
    const mood = s.pan > 0 ? s.pan + ' fleeing' : world.alarm > 0 ? 'shaken' : s.hl > 0 ? 'surviving' : 'at peace';
    const warn = s.pan > 0 || world.alarm > 0 || totalFires > 0;
    const y = R.cam.yaw, wx = world.wind[0], wz = world.wind[1];
    const windDeg = Math.round(Math.atan2(wx * Math.cos(y) - wz * Math.sin(y), -wx * Math.sin(y) - wz * Math.cos(y)) * 57.2958);

    if (prevHud.pop !== s.alive) { prevHud.pop = s.alive; $('s-pop').textContent = s.alive; $('s-pop-mini').textContent = s.alive; }
    if (prevHud.inj !== s.inj) { prevHud.inj = s.inj; $('s-inj').textContent = s.inj; }
    if (prevHud.dead !== s.dead) { prevHud.dead = s.dead; $('s-dead').textContent = s.dead; }
    if (prevHud.hl !== s.hl) { prevHud.hl = s.hl; $('s-hl').textContent = s.hl; }
    if (prevHud.bs !== s.bs || prevHud.bt !== s.bt) { prevHud.bs = s.bs; prevHud.bt = s.bt; $('s-b').textContent = s.bs + '/' + s.bt; }
    if (prevHud.fires !== totalFires) { prevHud.fires = totalFires; $('s-fire').textContent = totalFires; }
    if (prevHud.clock !== clock) { prevHud.clock = clock; $('s-clock').textContent = clock; }
    if (prevHud.mood !== mood) { prevHud.mood = mood; $('s-mood').textContent = mood; $('s-mood-mini').textContent = mood; }
    if (prevHud.warn !== warn) { prevHud.warn = warn; $('s-mood-mini').classList.toggle('warn', warn); }
    if (prevHud.windDeg !== windDeg) {
      prevHud.windDeg = windDeg;
      const tr = 'rotate(' + windDeg + 'deg)';
      $('s-wind').style.transform = tr;
      $('s-wind-mini').style.transform = tr;
    }

    const n = R.sel, card = $('card');
    if (n) {
      if (prevHud.selId !== n.id) { prevHud.selId = n.id; card.classList.add('show'); $('c-name').textContent = n.name; }
      const b = world.buildings[n.home];
      const job = n.job + (n.homeless ? ' · homeless' : b && b.type === 'tent' ? ' · lives in a tent' : '');
      const st = n.st === DEAD ? 'Dead' + (n.cause ? ' — ' + n.cause : '') : n.st === PANIC ? 'Fleeing in terror' : n.st === STUMBLE ? 'Knocked to the ground' : n.st === SHAKEN ? 'Shaken, watching from a distance' : n.inside ? 'Asleep at home' : n.goal === 'camp' ? 'Sheltering at the camp' : n.goal === 'home' ? 'Heading home' : n.goal === 'plaza' ? (n.moving ? 'Walking to the square' : 'Talking in the square') : n.working ? 'Working' : n.moving ? 'Walking to work' : 'Resting';
      const hp = Math.round(clamp(n.hp, 0, 1) * 100);
      if (prevHud.selJob !== job) { prevHud.selJob = job; $('c-job').textContent = job; }
      if (prevHud.selSt !== st) { prevHud.selSt = st; $('c-st').textContent = st; }
      if (prevHud.selHp !== hp) { prevHud.selHp = hp; $('c-hp').style.width = hp + '%'; }
    } else if (prevHud.selId !== -1) {
      prevHud.selId = -1;
      card.classList.remove('show');
    }
  }

  // ------------------------------------------------------------ loop
  function frame(ts) {
    const elapsed = (ts - last) / 1000 || 0.016, dt = Math.min(0.05, elapsed); last = ts; frameN++;
    fps.n++; fps.acc += elapsed; fps.worst = Math.max(fps.worst, elapsed * 1000);
    if (fps.n >= 30) { fps.ms = fps.acc / fps.n * 1000; fps.fps = 1000 / fps.ms; fps.n = 0; fps.acc = 0; fps.worst = dt * 1000; }
    keyCam(dt);
    if (!paused && started) {
      acc += dt * speed; let n = 0;
      while (acc >= STEP && n < 6) { toolTick(STEP); world.tick(STEP); acc -= STEP; n++; }
      if (n >= 6) acc = 0;
    } else if (started) { world.finger = null; }

    R.updateCam(dt, world);
    const cameraGesture = mouse.mode === 'pan' || mouse.mode === 'rot' || mouse.mode === 'gest';
    const hideHand = isModalOpen() || panMode || cameraGesture;
    const needPick = (mouse.inside || mouse.down) && !hideHand;
    mouse.hit = needPick ? R.pick(mouse.nx, mouse.ny, world) : null;
    const pressing = tool === 'finger' && fing.ph !== 0;
    const contact = pressing && needPick ? { x: fing.x, z: fing.z, y: world.hAt(fing.x, fing.z) } : mouse.hit;
    const depth = pressing ? (fing.ph === 1 ? fing.t * fing.t : 1 - fing.t) : 0;
    R.hand.update(dt, R, world, hideHand, contact, tool, mouse.mode === 'act', depth);
    R.shadow[3] = 0;
    if (R.hand.visible && contact) {
      R.shadow[0] = contact.x;
      R.shadow[1] = contact.z;
      R.shadow[2] = R.hand.size * 1.4;
      R.shadow[3] = 0.14 + 0.2 * depth;
    }
    marker();
    if (!paused && started) emitFx(dt);
    R.draw(world, paused ? 0 : dt);
    hudT -= dt; if (hudT <= 0) { hudT = 0.2; hud(); if (started) audioMix(0.2); }
    requestAnimationFrame(frame);
  }

  function init() {
    try { R = new Renderer(canvas); } catch (e) { $('start-msg').textContent = 'This browser cannot run the game: ' + e.message; $('begin').style.display = 'none'; return; }
    R.extra = extraDraw;
    const tb = $('tools');
    TOOLS.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.t = t.id;
      b.title = t.name + ' (' + (i + 1) + ')';
      b.setAttribute('aria-label', t.name);
      b.innerHTML = '<span class="ic">' + ICONS[t.id] + '</span><span class="nm">' + t.short + '</span><span class="ky">' + (i + 1) + '</span>';
      b.onclick = () => { audio.start(); setTool(t.id); };
      tb.appendChild(b);
    });

    $('rng').oninput = e => setInt(e.target.value / 100);
    for (const b of document.querySelectorAll('.inten-presets button')) b.onclick = () => setInt(+b.dataset.p / 100);
    $('inten-btn').onclick = e => { e.stopPropagation(); $('bar').classList.toggle('inten-open'); };
    $('pan-btn').onclick = () => { audio.start(); setPanMode(!panMode || orbitMode); };

    for (const b of document.querySelectorAll('#speed button')) b.onclick = () => setSpeed(+b.dataset.s);
    $('orbit-btn').onclick = () => setPanMode(!orbitMode, true);
    $('save').onclick = () => { save(); if (isMenuOpen()) setMenuOpen(false); };
    $('load').onclick = () => { load(); if (isMenuOpen()) setMenuOpen(false); };
    $('new').onclick = () => { newWorld(); toast('A new world is born — your saved world is untouched'); if (isMenuOpen()) setMenuOpen(false); };
    $('mute').onclick = toggleMute;
    $('mute-quick').onclick = toggleMute;
    $('helpb').onclick = () => setHelpOpen(!isHelpOpen());
    $('help-close').onclick = () => setHelpOpen(false);
    $('help').onclick = e => { if (e.target === $('help')) setHelpOpen(false); };
    $('help').firstElementChild.onclick = e => e.stopPropagation();

    $('menub').onclick = e => { e.stopPropagation(); setMenuOpen(!isMenuOpen()); };
    $('menu-backdrop').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); });
    $('menu-backdrop').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); });

    for (const b of document.querySelectorAll('.menu-tilt-btns button')) {
      b.onclick = () => { R.cam.gpitch = +b.dataset.tilt; setMenuOpen(false); };
    }
    $('cam-reset').onclick = () => {
      R.cam.gtx = world.vc.x; R.cam.gtz = world.vc.z; R.cam.gdist = 62; R.cam.gpitch = 0.72; R.cam.gyaw = 0.5;
      follow = false; setMenuOpen(false);
    };

    $('stats-toggle').onclick = () => setStatsCollapsed(!$('stats').classList.contains('collapsed'), true);
    $('card-close').onclick = () => { R.sel = null; follow = false; };
    $('rotate-dismiss').onclick = () => { rotateDismissed = true; $('rotate-tip').classList.remove('show'); };

    document.addEventListener('pointerdown', e => {
      if ($('bar').classList.contains('inten-open') && !$('bar').contains(e.target)) {
        $('bar').classList.remove('inten-open');
      }
    });

    try {
      const saved = JSON.parse(localStorage.getItem('ruin-sound'));
      if (saved) { audio.setVolume(saved.volume); audio.setMuted(saved.muted === true); }
    } catch (_) {}
    const volume = $('master-volume');
    volume.value = Math.round(audio.volume * 100);
    $('volume-value').textContent = volume.value + '%';
    volume.oninput = () => {
      audio.setVolume(Number(volume.value) / 100);
      $('volume-value').textContent = volume.value + '%';
      saveSoundSettings();
    };
    newWorld(); setInt(0.6); setTool('observe'); setSpeed(1); syncMuteUI(); syncLayout();
    $('start-msg').textContent = 'A village wakes beside the river. It does not know you are watching.';
    $('begin').disabled = false; if (hasSave()) $('cont').style.display = '';
    const go = cont => {
      audio.start(); audio.startMusic(); if (cont) load();
      started = true; $('start').classList.add('gone');
      syncLayout();
      log('The valley wakes. ' + world.stats().alive + ' villagers begin their day.');
    };
    $('begin').onclick = () => go(false); $('cont').onclick = () => go(true);

    window.__game = {
      get world() { return world; },
      R, setTool, setInt, save, load, newWorld, mouse, audio, fps,
      get started() { return started; },
      setSpeed,
      get tool() { return tool; },
      get panMode() { return panMode; },
      setPanMode,
      isModalOpen
    };
    requestAnimationFrame(frame);
  }
  setTimeout(init, 30);
})();
