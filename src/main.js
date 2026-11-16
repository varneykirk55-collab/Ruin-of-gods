'use strict';
// ===================== GOD SIM — input, HUD, game loop =====================
(function () {
  const $ = id => document.getElementById(id);
  const canvas = $('c'), STEP = 1 / 60, KEY = 'godsim.save.v1';
  const TOOLS = [
    { id: 'observe', icon: '👁', name: 'Observe', hint: 'Drag to move the camera. Click a villager to follow them.' },
    { id: 'quake', icon: '⛰️', name: 'Earthquake', hint: 'Drag a fault line across the land, then release.' },
    { id: 'flood', icon: '🌊', name: 'Flood', hint: 'Drag to carve a channel and redirect water. Use it on the dam to break it.' },
    { id: 'meteor', icon: '☄️', name: 'Meteor', hint: 'Click to call down a meteor.' },
    { id: 'finger', icon: '👆', name: 'Divine Finger', hint: 'Click or hold to press the land flat.' },
    { id: 'fire', icon: '🔥', name: 'Firestorm', hint: 'Click or drag to set the land alight. Fire follows the wind.' },
    { id: 'lightning', icon: '⚡', name: 'Lightning', hint: 'Click to blast a storm of lightning down. Bolts seek the tallest things.' },
    { id: 'tornado', icon: '🌪️', name: 'Tornado', hint: 'Click to touch down a tornado. Move the mouse to steer it. It pulls, lifts, and throws.' },
    { id: 'delete', icon: '✧', name: 'Deletion', hint: 'Divine Deletion: hover a building, tree, prop, or villager — it glows. Click or drag to unmake it. The land and the river stay.' }
  ];
  let R, world, audio = new AudioEngine(), tool = 'observe', intensity = 0.6, paused = false, speed = 1, started = false, memSave = null;
  let last = 0, acc = 0, frameN = 0, hudT = 0, follow = false, lastHour = -1;
  const mouse = { nx: 0, ny: 0, px: 0, py: 0, down: false, mode: '', hit: null, moved: 0, inside: false };
  const keys = {}; const ptrs = new Map(); let gest = null;
  let qStart = null, lastCarve = null, fireT = 0, fing = { ph: 0, t: 0, x: 0, z: 0, cd: 0 }, delHover = null, delStroke = null;
  const fps = { n: 0, acc: 0, ms: 16, fps: 60, worst: 16 };
  const mix = { wind: 0, river: 0, fire: 0, quake: 0, rain: 0, flood: 0, village: 0, day: 1, calm: true, near: 1 };

  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600); }
  function log(m) { const l = $('log'), d = document.createElement('div'); d.textContent = m; l.appendChild(d); while (l.children.length > 5) l.removeChild(l.firstChild); setTimeout(() => d.classList.add('old'), 7000); setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 14000); }
  function flash(a) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = 'opacity 1.4s ease-out'; f.style.opacity = 0; }); }
  function sfx(name, x, z, v) { const c = R.cam, d = Math.hypot(x - c.tx, z - c.tz), a = clamp(1.25 - d / (c.dist * 1.1 + 45), 0.06, 1); audio.play(name, v * a); }
  function bindWorld(w) {
    world = w; R.sel = null; follow = false; qStart = null;
    w.fx = { burst: (t, x, y, z, n, s, p) => R.parts.burst(t, x, y, z, n, s, p), sound: sfx, shake: a => { R.cam.shake = Math.max(R.cam.shake, Math.min(1.7, a)); }, flash, log };
    w.terrDirty = true; w.staticDirty = true;
  }
  function setTool(id) { tool = id; qStart = null; for (const b of document.querySelectorAll('#tools button')) b.classList.toggle('on', b.dataset.t === id); const t = TOOLS.find(t => t.id === id); $('hint').textContent = t.hint; canvas.style.cursor = id === 'observe' ? 'grab' : 'crosshair'; $('inten').style.visibility = id === 'observe' ? 'hidden' : 'visible'; audio.play('ui', 1); }
  function setSpeed(s) { speed = s; paused = s === 0; for (const b of document.querySelectorAll('#speed button')) b.classList.toggle('on', +b.dataset.s === s); }

  // ------------------------------------------------------------ save / load
  function hasSave() { try { if (localStorage.getItem(KEY)) return true; } catch (e) { } return !!memSave; }
  function save() { const c = R.cam, s = JSON.stringify({ world: world.serialize(), cam: [c.gtx, c.gtz, c.gyaw, c.gpitch, c.gdist] }); memSave = s; let ok = false; try { localStorage.setItem(KEY, s); ok = true; } catch (e) { } toast(ok ? 'World saved — it will be here when you come back' : 'Saved for this session only (browser storage is unavailable here)'); }
  function load() { let s = null; try { s = localStorage.getItem(KEY); } catch (e) { } s = s || memSave; if (!s) { toast('No saved world yet'); return false; } try { const d = JSON.parse(s); bindWorld(World.load(d.world)); const c = R.cam; if (d.cam) { c.gtx = d.cam[0]; c.gtz = d.cam[1]; c.gyaw = d.cam[2]; c.gpitch = d.cam[3]; c.gdist = d.cam[4]; } R.parts.n = 0; toast('Saved world restored'); return true; } catch (e) { console.error(e); toast('That save could not be read'); return false; } }
  function newWorld(seed) { bindWorld(new World(seed || ((Math.random() * 1e9) | 0))); const c = R.cam; c.gtx = c.tx = world.vc.x; c.gtz = c.tz = world.vc.z; c.gdist = 62; c.gpitch = 0.72; c.gyaw = 0.5; R.parts.n = 0; }

  // ------------------------------------------------------------ input
  function setMouse(e) { const r = canvas.getBoundingClientRect(); mouse.px = e.clientX - r.left; mouse.py = e.clientY - r.top; mouse.nx = mouse.px / r.width * 2 - 1; mouse.ny = 1 - mouse.py / r.height * 2; mouse.inside = true; }
  function pan(dx, dy) { const c = R.cam, s = c.gdist * 0.0019, cy = Math.cos(c.gyaw), sy = Math.sin(c.gyaw); c.gtx += (-dx * cy - dy * sy) * s; c.gtz += (dx * sy - dy * cy) * s; follow = false; }
  function beginAction() {
    const h = mouse.hit = R.pick(mouse.nx, mouse.ny, world); if (!h) return;
    if (tool === 'quake') qStart = { x: h.x, z: h.z };
    else if (tool === 'flood') lastCarve = { x: h.x, z: h.z };
    else if (tool === 'meteor') world.meteor(h.x, h.z, intensity);
    else if (tool === 'lightning') world.lightning(h.x, h.z, intensity);
    else if (tool === 'tornado') world.spawnTornado(h.x, h.z, intensity);
    else if (tool === 'delete') { delStroke = new Set(); tryDelete(true); }
    else if (tool === 'fire') fireT = 0;
  }
  function endAction() { if (tool === 'quake' && qStart) { const h = mouse.hit; if (h) world.quake(qStart.x, qStart.z, h.x, h.z, intensity); qStart = null; } lastCarve = null; delStroke = null; }
  function deletionTarget() {
    if (!mouse.hit && !mouse.inside) return null;
    const d = R.ray(mouse.nx, mouse.ny), h = mouse.hit;
    return world.queryDelete(R.eye[0], R.eye[1], R.eye[2], d[0], d[1], d[2], h ? h.x : null, h ? h.z : null, 0.55 + intensity * 1.15);
  }
  function delKey(o) {
    if (!o) return '';
    if (o.kind === 'b') return 'b' + o.b.id;
    if (o.kind === 'n') return 'n' + o.n.id;
    if (o.kind === 'tree') return 't' + o.i;
    if (o.kind === 'well') return 'w';
    if (o.kind === 'camp') return 'c' + o.c.x + '_' + o.c.z;
    return o.kind + (o.x * 10 | 0) + '_' + (o.z * 10 | 0);
  }
  function tryDelete(force) {
    const o = deletionTarget(); delHover = o;
    if (!force && !(mouse.down && mouse.mode === 'act')) return;
    if (!o) return;
    const k = delKey(o); if (delStroke && delStroke.has(k)) return;
    if (world.applyDelete(o)) { if (delStroke) delStroke.add(k); if (o.kind === 'n' && R.sel === o.n) { R.sel = null; follow = false; } }
  }
  function frameTarget(B, o) {
    const x0 = o.x - o.sx * 0.5, x1 = o.x + o.sx * 0.5, y0 = o.y - o.sy * 0.5, y1 = o.y + o.sy * 0.5, z0 = o.z - o.sz * 0.5, z1 = o.z + o.sz * 0.5, th = 0.07;
    const post = (x, z) => B.push(x, (y0 + y1) * 0.5, z, th, Math.max(0.2, o.sy), th, 0, 0, 0, 1, 0.9, 0.45, 0.9);
    post(x0, z0); post(x1, z0); post(x0, z1); post(x1, z1);
    B.push((x0 + x1) * 0.5, y1, z0, o.sx, th, th, 0, 0, 0, 1, 0.92, 0.5, 0.9);
    B.push((x0 + x1) * 0.5, y1, z1, o.sx, th, th, 0, 0, 0, 1, 0.92, 0.5, 0.9);
    B.push(x0, y1, (z0 + z1) * 0.5, th, th, o.sz, 0, 0, 0, 1, 0.92, 0.5, 0.9);
    B.push(x1, y1, (z0 + z1) * 0.5, th, th, o.sz, 0, 0, 0, 1, 0.92, 0.5, 0.9);
  }
  function trySelect() { let best = 30, bn = null; const r = canvas.getBoundingClientRect(); for (const n of world.npcs) { if (n.inside || (n.st === DEAD && n.deadT >= 999)) continue; const p = R.project(n.x, n.y + 0.4, n.z); if (p[2] <= 0) continue; const d = Math.hypot((p[0] + 1) / 2 * r.width - mouse.px, (1 - p[1]) / 2 * r.height - mouse.py); if (d < best) { best = d; bn = n; } } R.sel = bn; follow = !!bn; if (bn) R.cam.gdist = Math.min(R.cam.gdist, 26); }
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (!started) return; audio.start(); canvas.setPointerCapture(e.pointerId); setMouse(e); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'touch' && ptrs.size === 2) { if (mouse.mode === 'act') { qStart = null; lastCarve = null; } mouse.down = false; mouse.mode = 'gest'; const p = [...ptrs.values()]; gest = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), a: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x), cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2 }; return; }
    if (ptrs.size > 1) return;
    mouse.down = true; mouse.moved = 0;
    if (e.button === 2) mouse.mode = 'rot'; else if (e.button === 1 || e.shiftKey || tool === 'observe') mouse.mode = 'pan'; else { mouse.mode = 'act'; beginAction(); }
    if (mouse.mode === 'pan') canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId), dx = p ? e.clientX - p.x : 0, dy = p ? e.clientY - p.y : 0; if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (mouse.mode === 'gest' && ptrs.size >= 2 && gest) { const q = [...ptrs.values()], d = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y), a = Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x), cx = (q[0].x + q[1].x) / 2, cy = (q[0].y + q[1].y) / 2, c = R.cam; if (gest.d > 10 && d > 10) c.gdist *= gest.d / d; let da = a - gest.a; if (da > 3.14) da -= 6.283; if (da < -3.14) da += 6.283; c.gyaw -= da; pan(cx - gest.cx, cy - gest.cy); gest = { d, a, cx, cy }; return; }
    setMouse(e); if (!mouse.down) return; mouse.moved += Math.abs(dx) + Math.abs(dy);
    if (mouse.mode === 'rot') { R.cam.gyaw -= dx * 0.006; R.cam.gpitch += dy * 0.005; } else if (mouse.mode === 'pan') pan(dx, dy);
    else if (mouse.mode === 'act' && tool === 'delete') tryDelete(true);
  });
  const up = e => {
    ptrs.delete(e.pointerId); if (mouse.mode === 'gest') { if (ptrs.size < 2) { gest = null; mouse.mode = ''; } return; }
    if (!mouse.down) return; mouse.down = false;
    if (mouse.mode === 'act') endAction(); else if (mouse.mode === 'pan' && tool === 'observe' && mouse.moved < 6) trySelect();
    mouse.mode = ''; canvas.style.cursor = tool === 'observe' ? 'grab' : 'crosshair';
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { mouse.inside = false; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); R.cam.gdist *= Math.exp(e.deltaY * 0.0012); }, { passive: false });
  window.addEventListener('keydown', e => {
    if (!started) return; const k = e.key.toLowerCase(); keys[k] = true;
    if (k >= '1' && k <= '9') setTool(TOOLS[+k - 1].id);
    else if (k === ' ' || k === 'p') { setSpeed(paused ? 1 : 0); e.preventDefault(); }
    else if (k === '[') setInt(intensity - 0.1); else if (k === ']') setInt(intensity + 0.1);
    else if (k === 'm') toggleMute(); else if (k === 'escape') { R.sel = null; follow = false; qStart = null; $('help').classList.remove('show'); }
    else if (k === 'h' || k === '?') $('help').classList.toggle('show');
    if (k.startsWith('arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  function setInt(v) { intensity = clamp(v, 0.1, 1); $('rng').value = Math.round(intensity * 100); $('rv').textContent = Math.round(intensity * 100) + '%'; }
  function toggleMute() { audio.setMuted(!audio.muted); $('mute').textContent = audio.muted ? '🔇' : '🔊'; }

  function keyCam(dt) {
    const c = R.cam, s = c.gdist * 0.9 * dt; let f = 0, r = 0;
    if (keys.w || keys.arrowup) f += 1; if (keys.s || keys.arrowdown) f -= 1; if (keys.d || keys.arrowright) r += 1; if (keys.a || keys.arrowleft) r -= 1;
    if (f || r) { const cy = Math.cos(c.gyaw), sy = Math.sin(c.gyaw); c.gtx += (-sy * f + cy * r) * s; c.gtz += (-cy * f - sy * r) * s; follow = false; }
    if (keys.q) c.gyaw += dt * 1.4; if (keys.e) c.gyaw -= dt * 1.4; if (keys.r) c.gpitch += dt * 0.8; if (keys.f) c.gpitch -= dt * 0.8;
    if (keys['='] || keys['+']) c.gdist *= 1 - dt * 1.2; if (keys['-']) c.gdist *= 1 + dt * 1.2;
    if (follow && R.sel) { c.gtx = R.sel.x; c.gtz = R.sel.z; }
  }

  // ------------------------------------------------------------ powers held down (per sim tick)
  function toolTick(dt) {
    const h = mouse.hit, act = mouse.down && mouse.mode === 'act';
    world.finger = (tool === 'finger' && h && mouse.inside) ? { x: h.x, z: h.z, r: 3.5 + 2.4 * intensity } : null;
    world.steer = (tool === 'tornado' && h && (mouse.inside || act)) ? { x: h.x, z: h.z, strong: !!act } : null;
    if (tool === 'flood' && act && h) { const a = lastCarve || h, d = Math.hypot(h.x - a.x, h.z - a.z), n = Math.max(1, Math.ceil(d)); for (let k = 1; k <= n; k++) world.carve(a.x + (h.x - a.x) * k / n, a.z + (h.z - a.z) * k / n, intensity, dt); lastCarve = { x: h.x, z: h.z }; }
    if (tool === 'fire' && act && h) { fireT -= dt; if (fireT <= 0) { world.ignite(h.x, h.z, intensity); fireT = 0.22; } }
    if (fing.cd > 0) fing.cd -= dt;
    if (fing.ph === 0) { if (tool === 'finger' && act && h && fing.cd <= 0) { fing.ph = 1; fing.t = 0; fing.x = h.x; fing.z = h.z; } }
    else if (fing.ph === 1) { fing.t += dt / 0.16; if (fing.t >= 1) { world.fingerPress(fing.x, fing.z, intensity); fing.ph = 2; fing.t = 0; } }
    else { fing.t += dt / 0.32; if (fing.t >= 1) { fing.ph = 0; fing.cd = 0.08; } }
  }
  function extraDraw(B, P) {
    const h = mouse.hit;
    if (tool === 'quake' && qStart && h) { const d = Math.hypot(h.x - qStart.x, h.z - qStart.z), n = Math.max(2, Math.ceil(d / 1.2)); for (let k = 0; k <= n; k++) { const x = qStart.x + (h.x - qStart.x) * k / n, z = qStart.z + (h.z - qStart.z) * k / n; B.push(x, world.hAt(x, z) + 0.25, z, 0.5, 0.18, 0.5, 0, k, 0, 1, 0.35, 0.15, 1); } }
    if (tool === 'finger' && (h && mouse.inside || fing.ph)) {
      const fx = fing.ph ? fing.x : h.x, fz = fing.ph ? fing.z : h.z, fr = (1.6 + 2.4 * intensity) * 0.6, hov = 3.5 + fr * 2;
      const p = fing.ph === 1 ? fing.t * fing.t : fing.ph === 2 ? 1 - fing.t : 0, ty = world.hAt(fx, fz) + hov * (1 - p) - 0.2 * p, c = [0.94, 0.77, 0.63], yw = R.cam.yaw;
      B.push(fx, ty + 0.35 * fr, fz, 1.1 * fr, 0.7 * fr, 1.1 * fr, 0, yw, 0, c[0], c[1], c[2], 0.08);
      B.push(fx, ty + 1.4 * fr, fz, 1.45 * fr, 1.9 * fr, 1.45 * fr, 0, yw, 0, c[0], c[1], c[2], 0.08);
      B.push(fx, ty + 3.5 * fr, fz, 1.6 * fr, 2.5 * fr, 1.6 * fr, 0, yw, 0, c[0] * 0.97, c[1] * 0.96, c[2] * 0.95, 0.08);
      B.push(fx, ty + 6.4 * fr, fz, 1.78 * fr, 3.4 * fr, 1.78 * fr, 0, yw, 0, c[0] * 0.95, c[1] * 0.93, c[2] * 0.92, 0.08);
      B.push(fx + Math.sin(yw) * 0.74 * fr, ty + 1.25 * fr, fz + Math.cos(yw) * 0.74 * fr, 1.05 * fr, 1.5 * fr, 0.1 * fr, 0, yw, 0, 0.99, 0.92, 0.88, 0.15);
      B.push(fx, ty + 2.36 * fr, fz, 1.5 * fr, 0.05 * fr, 1.5 * fr, 0, yw, 0, c[0] * 0.8, c[1] * 0.75, c[2] * 0.72, 0); B.push(fx, ty + 4.76 * fr, fz, 1.65 * fr, 0.05 * fr, 1.65 * fr, 0, yw, 0, c[0] * 0.8, c[1] * 0.75, c[2] * 0.72, 0);
      R.shadow[0] = fx; R.shadow[1] = fz; R.shadow[2] = fr * 2.6; R.shadow[3] = 0.25 + 0.35 * p;
    } else R.shadow[3] = 0;
    if (tool === 'delete' && delHover) frameTarget(B, delHover);
  }
  function marker() {
    const h = mouse.hit, m = R.mark, c = R.markC; if (!h || tool === 'observe' || !mouse.inside && !mouse.down) { c[3] = 0; return; }
    m[0] = h.x; m[1] = h.z; c[3] = 0.75;
    if (tool === 'quake') { m[2] = 1.2; c[0] = 1; c[1] = 0.5; c[2] = 0.2; }
    else if (tool === 'flood') { m[2] = 1.2 + 1.3 * intensity; c[0] = 0.3; c[1] = 0.7; c[2] = 1; if (world.nearDam(h.x, h.z, 2 + intensity)) { m[2] = 2.5 + 3.5 * intensity; c[0] = 1; c[1] = 0.9; c[2] = 0.4; } }
    else if (tool === 'meteor') { m[2] = 4 + 7 * intensity; c[0] = 1; c[1] = 0.25; c[2] = 0.15; }
    else if (tool === 'finger') { m[2] = 1.6 + 2.4 * intensity; c[0] = 1; c[1] = 0.9; c[2] = 0.75; }
    else if (tool === 'lightning') { m[2] = 5 + 9 * intensity; c[0] = 0.6; c[1] = 0.75; c[2] = 1; }
    else if (tool === 'tornado') { m[2] = 3.2 + 5.5 * intensity; c[0] = 0.72; c[1] = 0.78; c[2] = 0.84; }
    else if (tool === 'delete') { m[2] = delHover ? Math.max(delHover.sx, delHover.sz) * 0.55 : 0.8; c[0] = 1; c[1] = 0.88; c[2] = 0.4; if (!delHover) c[3] = 0.28; }
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

  // ------------------------------------------------------------ HUD
  function hud() {
    const s = world.stats(), t = world.time * 24, hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
    $('s-pop').textContent = s.alive; $('s-inj').textContent = s.inj; $('s-dead').textContent = s.dead; $('s-hl').textContent = s.hl; $('s-b').textContent = s.bs + '/' + s.bt; $('s-fire').textContent = s.fires + world.buildings.filter(b => b.fire > 0).length;
    $('s-clock').textContent = 'Day ' + world.day + ' · ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + (world.rain > 0 ? ' · rain' : '');
    const y = R.cam.yaw, wx = world.wind[0], wz = world.wind[1]; $('s-wind').style.transform = 'rotate(' + Math.atan2(wx * Math.cos(y) - wz * Math.sin(y), -wx * Math.sin(y) - wz * Math.cos(y)) + 'rad)';
    $('s-mood').textContent = s.pan > 0 ? s.pan + ' fleeing' : world.alarm > 0 ? 'shaken' : s.hl > 0 ? 'surviving' : 'at peace';
    const n = R.sel, card = $('card');
    if (n) { card.classList.add('show'); const b = world.buildings[n.home]; let st = n.st === DEAD ? 'Dead' + (n.cause ? ' — ' + n.cause : '') : n.st === PANIC ? 'Fleeing in terror' : n.st === STUMBLE ? 'Knocked to the ground' : n.st === SHAKEN ? 'Shaken, watching from a distance' : n.inside ? 'Asleep at home' : n.goal === 'camp' ? 'Sheltering at the camp' : n.goal === 'home' ? 'Heading home' : n.goal === 'plaza' ? (n.moving ? 'Walking to the square' : 'Talking in the square') : n.working ? 'Working' : n.moving ? 'Walking to work' : 'Resting';
      $('c-name').textContent = n.name; $('c-job').textContent = n.job + (n.homeless ? ' · homeless' : b && b.type === 'tent' ? ' · lives in a tent' : ''); $('c-st').textContent = st; $('c-hp').style.width = Math.round(clamp(n.hp, 0, 1) * 100) + '%'; }
    else card.classList.remove('show');
  }

  // ------------------------------------------------------------ loop
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; frameN++;
    fps.n++; fps.acc += dt; fps.worst = Math.max(fps.worst, dt * 1000); if (fps.n >= 30) { fps.ms = fps.acc / fps.n * 1000; fps.fps = 1000 / fps.ms; fps.n = 0; fps.acc = 0; fps.worst = dt * 1000; }
    keyCam(dt);
    if (!paused && started) { acc += dt * speed; let n = 0; while (acc >= STEP && n < 6) { toolTick(STEP); world.tick(STEP); acc -= STEP; n++; } if (n >= 6) acc = 0; } else if (started) { world.finger = null; }
    if (started) world.decayFades(dt);
    R.updateCam(dt, world); mouse.hit = mouse.inside || mouse.down ? R.pick(mouse.nx, mouse.ny, world) : null;
    if (started && tool === 'delete') delHover = deletionTarget(); else if (tool !== 'delete') delHover = null;
    marker();
    if (!paused && started) emitFx(dt);
    R.draw(world, paused ? 0 : dt);
    hudT -= dt; if (hudT <= 0) { hudT = 0.2; hud(); if (started) audioMix(0.2); }
    requestAnimationFrame(frame);
  }

  function init() {
    try { R = new Renderer(canvas); } catch (e) { $('start-msg').textContent = 'This browser cannot run the game: ' + e.message; $('begin').style.display = 'none'; return; }
    R.extra = extraDraw;
    const tb = $('tools'); TOOLS.forEach((t, i) => { const b = document.createElement('button'); b.dataset.t = t.id; b.title = t.name + ' (' + (i + 1) + ')'; b.innerHTML = '<span class="ic">' + t.icon + '</span><span class="nm">' + t.name + '</span><span class="ky">' + (i + 1) + '</span>'; b.onclick = () => { audio.start(); setTool(t.id); }; tb.appendChild(b); });
    $('rng').oninput = e => setInt(e.target.value / 100);
    for (const b of document.querySelectorAll('#speed button')) b.onclick = () => setSpeed(+b.dataset.s);
    $('save').onclick = save; $('load').onclick = load; $('new').onclick = () => { newWorld(); toast('A new world is born — your saved world is untouched'); };
    $('mute').onclick = toggleMute; $('helpb').onclick = () => $('help').classList.toggle('show'); $('help').onclick = () => $('help').classList.remove('show');
    newWorld(); setInt(0.6); setTool('observe'); setSpeed(1);
    $('start-msg').textContent = 'A village wakes beside the river. It does not know you are watching.';
    $('begin').disabled = false; if (hasSave()) $('cont').style.display = '';
    const go = cont => { audio.start(); if (cont) load(); started = true; $('start').classList.add('gone'); log('The valley wakes. ' + world.stats().alive + ' villagers begin their day.'); };
    $('begin').onclick = () => go(false); $('cont').onclick = () => go(true);
    window.__game = { get world() { return world; }, R, setTool, setInt, save, load, newWorld, mouse, audio, fps, get started() { return started; }, setSpeed, get tool() { return tool; }, get delHover() { return delHover; } };
    requestAnimationFrame(frame);
  }
  setTimeout(init, 30);
})();
