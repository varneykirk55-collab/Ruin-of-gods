'use strict';
// ===================== GOD SIM — simulation core (no DOM) =====================
const N = 160, ROWS = 480, NN = N * ROWS;
const K = { GRASS: 0, FOREST: 1, FARM: 2, ROAD: 3, ROCK: 4, DAM: 5, SAND: 6 };
const ROUTINE = 0, PANIC = 1, STUMBLE = 2, SHAKEN = 3, DEAD = 4;
const DAYLEN = 360;

function rngMaker(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, z, s) { let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(s, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z, s) { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi; const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, z, s, o) { let a = 0, amp = 0.5, f = 1; for (let i = 0; i < o; i++) { a += amp * vnoise(x * f, z * f, s + i * 17); amp *= 0.5; f *= 2; } return a; }
function sstep(a, b, x) { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

function b64enc(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64dec(str) { const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

const VULN = {
  quake: { sup: 1, roof: 0.9, wall: 0.7, deck: 1 },
  fire: { roof: 1, wall: 0.38, sup: 0.55, deck: 0.8 },
  flood: { wall: 1, sup: 0.6, roof: 0.12, deck: 1 },
  blast: { sup: 1, roof: 1, wall: 1, deck: 1 },
  crush: { sup: 1, roof: 1, wall: 1, deck: 1 },
  impact: { roof: 1, wall: 0.8, sup: 0.5, deck: 1 },
  shock: { roof: 1, sup: 0.8, wall: 0.55, deck: 0.8 },
  stress: { sup: 1, roof: 1, wall: 1, deck: 1 },
  wind: { roof: 1.2, wall: 0.85, sup: 0.7, deck: 1.15 }
};
const NAMES = ['Ada', 'Bram', 'Cora', 'Dov', 'Edda', 'Finn', 'Greta', 'Hale', 'Ines', 'Jory', 'Kell', 'Lena', 'Milo', 'Nora', 'Odo', 'Pia', 'Quin', 'Rhea', 'Sten', 'Tova', 'Ulf', 'Vera', 'Wim', 'Yara', 'Zane', 'Asa', 'Berit', 'Calder', 'Dagny', 'Eskil'];
const SCAN = [0, 0, 2, 0, -2, 0, 0, 2, 0, -2, 2, 2, -2, 2, 2, -2, -2, -2, 4, 0, -4, 0, 0, 4, 0, -4, 3, 3, -3, 3, 3, -3, -3, -3];

class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.h = new Float32Array(NN); this.h0 = new Float32Array(NN);
    this.w = new Float32Array(NN); this.wb = new Float32Array(NN); this.dw = new Float32Array(NN);
    this.flow = new Float32Array(NN); this.f0 = new Float32Array(NN);
    this.flx = new Float32Array(NN); this.flz = new Float32Array(NN);
    this.fuel = new Float32Array(NN); this.burn = new Float32Array(NN);
    this.scorch = new Uint8Array(NN); this.crack = new Uint8Array(NN); this.mud = new Uint8Array(NN);
    this.kind = new Uint8Array(NN); this.tree = new Uint8Array(NN); this.flag = new Uint8Array(NN);
    this.bmap = new Int16Array(NN); this.bridge = new Uint8Array(NN);
    this.buildings = []; this.npcs = []; this.debris = []; this.rubble = []; this.fires = [];
    this.threats = []; this.quakes = []; this.meteors = []; this.emitters = []; this.craterCells = [];
    this.hazards = new Float32Array(NN);
    this.pathQ = []; this.camps = []; this.storms = []; this.bolts = []; this.boltFlash = 0;
    this.tornados = []; this.steer = null;
    this.time = 0.3; this.day = 1; this.tickN = 0; this.clock = 0;
    this.windA = 0.6; this.windS = 0.7; this.wind = [0, 0];
    this.rain = 0; this.rainT = 200 + Math.random() * 150;
    this.alarm = 0; this.screamT = 0; this.damBroken = false; this.settling = false;
    this.terrDirty = true; this.staticDirty = true;
    this.seepHold = 0; this.finger = null; this._dg = { x: 0, z: 0, r: 7 };
    this.rnd = Math.random;
    this.fx = { burst() { }, sound() { }, shake() { }, flash() { }, log() { } };
    // A* scratch
    this._g = new Float32Array(NN); this._came = new Int32Array(NN); this._st = new Uint32Array(NN); this._stamp = 0;
    this._hi = new Int32Array(NN * 4); this._hf = new Float32Array(NN * 4);
    this.gen();
    this.genFrontier();
    this.genArctic();
  }

  // ------------------------------------------------------------ generation
  rx(z) { return 80 + 10 * Math.sin(z * 0.043 + this.ph) + 3 * Math.sin(z * 0.11 + this.ph * 2); }
  bed(z) { return z < 57 ? 6.83 + (57 - z) * 0.16 : 6.83 - (z - 57) * 0.064; }
  rdist(x, z) { const zc = z < 20 ? 20 : z; const dr = 10 * 0.043 * Math.cos(zc * 0.043 + this.ph) + 3 * 0.11 * Math.cos(zc * 0.11 + this.ph * 2); let d = Math.abs(x - this.rx(zc)) / Math.sqrt(1 + dr * dr); if (z < 22) d += (22 - z) * 3; return d; }

  gen() {
    const s = this.seed, g = rngMaker(s); this.grng = g;
    this.ph = g() * 6.28;
    const h = this.h, kind = this.kind;
    const vcz = 100, vcx = Math.round(this.rx(vcz) + 16); this.vc = { x: vcx, z: vcz };
    const lk = { x: clamp(Math.round(this.rx(120) - 40), 18, 60), z: 122 }; this.lake = lk;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, d = this.rdist(x, z), zc = z < 20 ? 20 : z;
      const dv = Math.hypot(x - vcx, z - vcz);
      const roll = (fbm(x * 0.035, z * 0.035, s, 4) - 0.5) * (1 - 0.8 * sstep(26, 10, dv));
      let v = this.bed(zc) + 1.2 * sstep(1.3, 4.2, d) + 0.03 * Math.max(0, d - 4.2) + roll * 7 * Math.min(1, d / 26);
      const gz = sstep(24, 30, z) * sstep(63, 58, z);
      if (gz > 0) { v -= gz * 1.6 * sstep(11, 5, d); v += gz * 10 * sstep(10, 16, d); }
      const m = sstep(72, 30, z), rd = 1 - Math.abs(2 * fbm(x * 0.05, z * 0.05, s + 99, 4) - 1);
      v += m * (rd * rd * 22 + 3) * sstep(5, 16, d);
      const dl = Math.hypot(x - lk.x, z - lk.z); v -= 2.8 * sstep(9, 3, dl);
      if (z >= 57 && z <= 59 && d < 17) { v = Math.max(v, this.bed(57) + (d < 1.6 ? 6.2 : 7.2)); kind[i] = K.DAM; }
      const ed = Math.min(x, z, N - 1 - x, N - 1 - z); v = -2 + (v + 2) * sstep(0, 9, ed);
      h[i] = v;
    }
    // surface kinds
    const farms = [[Math.round(this.rx(98) - 22), 97, 9, 7], [vcx + 22, vcz + 24, 10, 5], [vcx + 32, vcz - 17, 6, 6]];
    const roadx = z => z < vcz - 12 ? Math.round(vcx + this.rx(z) - this.rx(vcz - 12)) : z > vcz + 12 ? Math.round(vcx + this.rx(z) - this.rx(vcz + 12)) : vcx;
    this.farmCells = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x; if (kind[i] === K.DAM) continue;
      const d = this.rdist(x, z), dv = Math.hypot(x - vcx, z - vcz), v = h[i];
      let k = K.GRASS;
      if (v > 17) k = K.ROCK; else if (d < 5 && z >= 20) k = K.SAND;
      else {
        for (const f of farms) if (Math.abs(x - f[0]) <= f[2] && Math.abs(z - f[1]) <= f[3] && d > 6.5) { k = K.FARM; }
        if (k === K.GRASS) {
          const fo = fbm(x * 0.055, z * 0.055, s + 5, 3);
          if (fo > 0.5 && d > 7 && dv > 19 && v > 0.8 && v < 16) { k = K.FOREST; if (g() < 0.72) this.tree[i] = 1; }
          else if (v > 0.8 && d > 6 && g() < (dv < 19 ? 0.02 : 0.012)) this.tree[i] = 1;
        }
      }
      if (v < 0.4) { k = K.SAND; this.tree[i] = 0; }
      kind[i] = k; if (k === K.FARM) this.farmCells.push(i);
    }
    // roads
    const road = (x, z) => { if (x < 2 || z < 2 || x > N - 3 || z > N - 3) return false; const i = z * N + x; if (this.rdist(x, z) < 5.2) return false; kind[i] = K.ROAD; this.tree[i] = 0; return true; };
    for (let z = vcz; z >= vcz - 30; z--) { if (!road(roadx(z), z)) break; road(roadx(z) + 1, z); }
    for (let z = vcz; z <= vcz + 36; z++) { if (!road(roadx(z), z)) break; road(roadx(z) + 1, z); }
    for (let x = vcx; x <= Math.min(N - 14, vcx + 46); x++) { road(x, vcz); road(x, vcz + 1); }
    const bxa = Math.floor(this.rx(vcz) - 6), bxb = Math.ceil(this.rx(vcz + 1) + 6);
    for (let x = vcx; x >= bxb; x--) { road(x, vcz); road(x, vcz + 1); }
    for (let x = bxa; x >= bxa - 9; x--) { road(x, vcz); road(x, vcz + 1); }
    for (let x = bxa; x <= bxb; x++) for (let dz = 0; dz < 2; dz++) { const i = (vcz + dz) * N + x; if (kind[i] !== K.ROAD) kind[i] = K.SAND; }
    // buildings
    this.addB('church', vcx + 6.5, vcz - 6.5, true, [-1, 0]);
    this.addB('tavern', vcx + 6.5, vcz + 7, true, [-1, 0]);
    this.addB('mill', Math.round(this.rx(vcz - 5) + 7.5), vcz - 5, false, [0, 1], true);
    for (const dz of [-24, -18, -12, -6, 14, 20, 26, 32]) { if (dz !== -6) this.addB('house', roadx(vcz + dz) + 5, vcz + dz, true, [-1, 0]); this.addB('house', roadx(vcz + dz) - 4, vcz + dz, true, [1, 0]); }
    this.addB('house', vcx - 4, vcz + 7, true, [1, 0]);
    for (const dx of [13, 19, 25, 31]) { this.addB('house', vcx + dx, vcz - 4, false, [0, 1]); this.addB('house', vcx + dx, vcz + 5, false, [0, -1]); }
    this.addB('house', Math.round(this.rx(vcz + 6) + 8.5), vcz + 6, false, [0, -1], true);
    this.addB('house', Math.round(this.rx(vcz + 6) + 8.5) + 6, vcz + 6, false, [0, -1], true);
    this.addB('house', Math.round(this.rx(vcz + 13) + 8.5), vcz + 13, true, [1, 0], true);
    this.addB('barn', farms[0][0] - farms[0][2] - 4, farms[0][1], true, [1, 0]);
    this.addB('barn', farms[1][0] + farms[1][2] + 4, farms[1][1], true, [-1, 0]);
    this.addB('barn', farms[2][0], farms[2][1] - farms[2][3] - 3.5, false, [0, 1]);
    this.addBridge(bxa, bxb, vcz);
    this.well = { x: vcx - 3, z: vcz - 2.5, gone: false };
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const i = (Math.round(this.well.z) + dz) * N + Math.round(this.well.x) + dx; this.tree[i] = 0; if (kind[i] === K.GRASS) kind[i] = K.ROAD; }
    this.genCount = this.buildings.length;
    // fuel
    for (let i = 0; i < N*N; i++) { const k = kind[i]; this.fuel[i] = k === K.GRASS ? 0.18 : k === K.FOREST ? (this.tree[i] ? 1 : 0.55) : k === K.FARM ? 0.5 : k === K.SAND ? 0.03 : 0; if (this.tree[i] && k !== K.FOREST) this.fuel[i] = 0.7; if (this.bmap[i]) { this.fuel[i] = 0; this.tree[i] = 0; } if (h[i] < 0) { this.flag[i] |= 2; this.tree[i] = 0; } }
    // water prefill
    const L = this.bed(57) + 6.2;
    for (let z = 22; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, d = this.rdist(x, z);
      if (z < 57 && z > 18 && d < 18 && h[i] < L + 0.04) this.w[i] = L + 0.04 - h[i];
      else if (d < 3 && h[i] > 0) this.w[i] = Math.max(0, this.bed(z) + 0.5 - h[i]);
    }
    const lc = h[lk.z * N + lk.x] + 2.0;
    for (let z = lk.z - 10; z <= lk.z + 10; z++) for (let x = lk.x - 10; x <= lk.x + 10; x++) { const i = z * N + x; if (h[i] < lc && Math.hypot(x - lk.x, z - lk.z) < 9) { this.w[i] = lc - h[i]; this.tree[i] = 0; this.fuel[i] = 0; if (kind[i] !== K.ROAD) kind[i] = K.SAND; } }
    this.spring = []; const sx = Math.round(this.rx(22)); for (let dx = -1; dx <= 1; dx++) this.spring.push(23 * N + sx + dx);
    this.h0.set(h);
    this.settling = true; for (let k = 0; k < 3600; k++) this.flowStep(); this.settling = false;
    this.wb.set(this.w); this.f0.set(this.flow);
    // work spots
    this.forestEdge = []; this.bankCells = [];
    for (let z = 4; z < N - 4; z++) for (let x = 4; x < N - 4; x++) {
      const i = z * N + x, dv = Math.hypot(x - vcx, z - vcz); if (dv > 48 || this.w[i] > 0.05) continue;
      if (kind[i] === K.GRASS && (kind[i + 1] === K.FOREST || kind[i - 1] === K.FOREST || kind[i + N] === K.FOREST || kind[i - N] === K.FOREST)) this.forestEdge.push(i);
      if (kind[i] === K.SAND && this.rdist(x, z) > 3.6 && dv < 34 && h[i] > 0.5) this.bankCells.push(i);
    }
    // villagers
    this.populate(this.buildings, g, this.farmCells, this.forestEdge, this.bankCells, vcx, vcz);
    this.terrDirty = true; this.staticDirty = true;
  }

  populate(buildings, g, farms, woods, banks, vcx, vcz) {
    let id = this.npcs.length;
    for (const b of buildings) {
      const cnt = b.type === 'house' ? 3 : b.type === 'tavern' ? 4 : b.type === 'mill' || b.type === 'barn' ? 2 : b.type === 'church' ? 1 : 0;
      for (let k = 0; k < cnt; k++) {
        const r = g(); let job, wi;
        if (b.type === 'church') { job = 'priest'; wi = this.ci(b.doorX, b.doorZ); }
        else if (b.type === 'mill') { job = 'miller'; wi = this.ci(b.doorX, b.doorZ); }
        else if (b.type === 'barn' || r < 0.4) { job = 'farmer'; wi = farms[(g() * farms.length) | 0]; }
        else if (r < 0.58 && woods.length) { job = 'woodcutter'; wi = woods[(g() * woods.length) | 0]; }
        else if (r < 0.7 && banks.length) { job = 'fisher'; wi = banks[(g() * banks.length) | 0]; }
        else if (r < 0.85) { job = 'trader'; wi = this.ci(vcx + 2 + g() * 4 - 2, vcz + 3 + g() * 3); }
        else { job = 'child'; wi = this.ci(b.doorX + g() * 6 - 3, b.doorZ + g() * 6 - 3); }
        const n = { id: id, name: NAMES[id % NAMES.length] + (id >= NAMES.length ? ' ' + 'IVX'[(id / NAMES.length | 0) - 1 > 2 ? 2 : (id / NAMES.length | 0) - 1] + '.' : ''), job, home: b.id, wx: wi % N, wz: (wi / N) | 0, x: b.doorX, z: b.doorZ, y: 0, hp: 1, st: ROUTINE, inside: false, path: null, pi: 0, goal: '', gx: 0, gz: 0, t: 0, calm: 0, senseT: g(), idleT: g() * 3, repT: 0, face: 0, tx: 0, tz: 0, moving: false, working: false, homeless: false, campT: 0, c: [0.3 + g() * 0.5, 0.25 + g() * 0.4, 0.2 + g() * 0.5], jx: g() * 0.5 - 0.25, jz: g() * 0.5 - 0.25, child: job === 'child', onFire: 0, cause: '' };
        id++; this.npcs.push(n);
      }
    }
    this.terrDirty = true; this.staticDirty = true;
  }

  // At the old southern shore this tidal channel now has a simulated neighbour.
  // Retain the saved seabed and let its water move across the former edge.
  inEstuary(i) {
    return (i>=146*N && i<175*N && i%N>=35 && i%N<=54) || (i>=306*N && i<335*N && i%N>=30 && i%N<=90);
  }

  genFrontier() {
    this.volcano = { x: 110, z: 280, state: 'dormant', remaining: 210, step: 0 };
    this.lava = new Map();
    this.basalt = new Uint8Array(NN);
    const villages = [{x:82,z:200}, {x:110,z:246}];
    const random = rngMaker(this.seed ^ 0x51ad);
    const creek = z => 44 + 12 * Math.sin((z-170)/26);
    const work = villages.map(() => ({farms:[], woods:[], banks:[]}));
    for (let z = N; z < 320; z++) for (let x = 0; x < N; x++) {
      const i = z*N+x, dz = z-N, river = Math.abs(x-creek(z));
      const shore = sstep(0,12,Math.min(dz+1,x,N-1-x,319-z));
      const hills = fbm(x*0.046,z*0.046,this.seed+37,3);
      const r = Math.hypot(x-110,z-280);
      const notch = sstep(6,0,Math.abs(x-110)) * sstep(280,275,z);
      const cone = Math.max(0,1-Math.max(5,r)/33)*34 - 3*sstep(5,2,r) - 5*notch*sstep(33,20,r);
      const ridge = 22 * Math.exp(-((x-15)**2/130+(z-279)**2/1050))*(0.7+hills);
      const lake = 8*Math.exp(-((z-256)**2)/110);
      const bed = 0.045*dz;
      const land = bed + 3.8 + (hills-0.45)*6 + ridge + Math.max(0,cone);
      const bank = sstep(1.2+lake,6+lake,river);
      // A spring-fed lake beside the ridge spills east through a shallow sill.
      const basin=Math.hypot((x-25)/8,(z-251)/10);
      const outlet=sstep(25,30,x)*sstep(45,38,x)*sstep(4,1,Math.abs(z-251));
      const lakeLevel=5.4;
      const bottom=Math.min(land, lakeLevel-1.7+1.1*basin*basin);
      let ground=bed-0.8+bank*(land-bed+0.8);
      ground+=sstep(1.65,0.85,basin)*(Math.min(ground,bottom)-ground);
      ground+=outlet*(Math.min(ground,lakeLevel-0.4-0.07*(x-25))-ground);
      const height = -2 + shore*(2 + ground);
      this.h[i] = height;
      this.w[i] = Math.max(0,-height, shore*(bed+0.15)-height);
      if (basin<1.5) this.w[i]=Math.max(this.w[i],lakeLevel-height);
      if (height < 0) this.flag[i] |= 2;
      const region = z < 225 ? 0 : 1, town = villages[region];
      const clearing = Math.hypot(x-town.x,z-town.z)<15;
      const routeX = 82+28*clamp((z-200)/46,0,1);
      const road = z>=192 && z<=253 && Math.abs(x-routeX)<1.4;
      const farm = Math.abs(x-town.x-10)<5 && Math.abs(z-town.z)<6;
      const forest = !clearing && hills>0.39 && (z>218 || hills>0.52);
      this.kind[i] = this.w[i]>0.04 ? K.SAND : road ? K.ROAD : farm ? K.FARM :
        r<24 || ridge>9 ? K.ROCK : forest ? K.FOREST : K.GRASS;
      if (this.kind[i]===K.FOREST && random()<0.32) this.tree[i]=1;
      this.fuel[i] = this.tree[i] ? 1 : this.kind[i]===K.FARM ? 0.55 : this.kind[i]===K.GRASS ? 0.2 : 0;
      if (farm && this.kind[i]===K.FARM) work[region].farms.push(i);
      if (Math.hypot(x-town.x,z-town.z)<21 && this.kind[i]===K.GRASS) work[region].woods.push(i);
      if (river<8 && !this.w[i] && Math.abs(z-town.z)<7) work[region].banks.push(i);
    }
    this.h0.set(this.h.subarray(N*N,320*N),N*N);
    this.wb.set(this.w.subarray(N*N,320*N),N*N);
    this.frontierBuildingStart = this.buildings.length;
    for (const [index,town] of villages.entries()) {
      const first = this.buildings.length;
      const plots = index === 0 ? [[-5,-6],[5,-6],[-6,1],[4,4],[-4,8]]
        : [[-8,-6],[3,-8],[-5,1],[5,3],[-11,7]];
      for (const [dx,dz] of plots) {
        this.addB('house',town.x+dx,town.z+dz,true,[dx<0?1:-1,0],true);
      }
      this.addB(index ? 'mill' : 'barn',town.x+12,town.z+9,true,[-1,0],true);
      // Short lanes lead from each door to the common road between villages.
      for (const b of this.buildings.slice(first)) {
        const z=Math.round(b.doorZ), road=Math.round(82+28*clamp((z-200)/46,0,1));
        const door=Math.round(b.doorX);
        for (let x=Math.min(door,road); x<=Math.max(door,road); x++) {
          const i=z*N+x;
          if (!this.bmap[i] && this.w[i]<0.04) { this.kind[i]=K.ROAD; this.tree[i]=0; this.fuel[i]=0; }
        }
      }
      const jobs = work[index];
      const firstResident=this.npcs.length;
      this.populate(this.buildings.slice(first),random,jobs.farms,jobs.woods,jobs.banks,town.x,town.z);
      for (let n=firstResident;n<this.npcs.length;n++) this.npcs[n].plaza=town;
    }
    this.genCount = this.buildings.length;
    this.spring.push(this.ci(creek(297),297),this.ci(24,250));
  }

  genArctic() {
    this.cold = new Uint8Array(NN);
    this.snow = new Uint8Array(NN);
    // Ice is a frozen portion of w, never an additional water source.
    this.ice = new Float32Array(NN);
    this.thaw = new Float32Array(NN);
    this.coldStep = 0; this.coldBand = 0;
    this.blizzard = {x:55,z:414,r:27,remaining:0,next:55,phase:0};
    this.arcticBuildingStart=this.buildings.length;
    const random=rngMaker(this.seed ^ 0x1ceab);
    const towns=[{x:79,z:376},{x:104,z:431}];
    for (let z=320;z<ROWS;z++) for (let x=0;x<N;x++) {
      const i=z*N+x, d=z-320;
      const noise=fbm(x*.043,z*.043,this.seed+819,3);
      const shore=sstep(0,12,Math.min(d+1,x,N-1-x,ROWS-1-z));
      const river=42+9*Math.sin(d/24);
      const valley=Math.abs(x-river);
      const ridge=29*Math.exp(-((x-127)**2/210+(z-396)**2/1400))*(.65+.35*Math.cos((z-390)/9)**2)*(1-.65*Math.exp(-((z-404)**2)/20));
      const peak=24*Math.exp(-((x-15)**2/160+(z-446)**2/360));
      const glacier=3*Math.floor(5*Math.exp(-((x-125)**2/300+(z-458)**2/240)));
      const lake=Math.hypot((x-66)/19,(z-414)/15);
      const land=4.2+noise*5+ridge+peak+glacier;
      let ground=land;
      if (valley<7) ground=3.5+sstep(1.3,7,valley)*(land-3.5);
      ground+=sstep(1.5,.85,lake)*(Math.min(ground,3.2+lake*lake)-ground);
      this.h[i]=-2+shore*(ground+2);
      this.w[i]=Math.max(0,-this.h[i],shore*4.8-this.h[i]);
      if (this.h[i]<0) this.flag[i]|=2;
      const climate=sstep(4,55,d+9*Math.sin(x*.063)+12*(noise-.5));
      this.cold[i]=Math.round(255*climate);
      this.snow[i]=this.w[i]>.04 ? 0 : Math.round(255*climate*(.65+.35*noise));
      this.ice[i]=this.w[i]>.08 && !(this.flag[i]&2) ? Math.min(this.w[i],.65)*climate : 0;
      // The central river retains a fast exposed channel.
      if (valley<1.5) this.ice[i]=0;
      const clearing=towns.some(t=>Math.hypot(x-t.x,z-t.z)<16);
      const roadX=79+25*clamp((z-376)/55,0,1);
      const road=z>=368&&z<=440&&Math.abs(x-roadX)<1.4;
      this.kind[i]=this.w[i]>.04 ? K.SAND : road ? K.ROAD : ridge+peak+glacier>10 ? K.ROCK : !clearing&&noise>.37 ? K.FOREST : K.GRASS;
      if(this.kind[i]===K.FOREST&&random()<.24)this.tree[i]=1;
      this.fuel[i]=this.tree[i]?1:this.kind[i]===K.GRASS?.16:0;
    }
    this.h0.set(this.h.subarray(320*N),320*N);
    this.wb.set(this.w.subarray(320*N),320*N);
    for (const town of towns) {
      const first=this.buildings.length;
      for(const [dx,dz] of [[-6,-6],[4,-6],[-6,3],[5,4]])this.addB('house',town.x+dx,town.z+dz,true,[dx<0?1:-1,0],true);
      this.addB('barn',town.x+12,town.z+10,true,[-1,0],true);
      const woods=[],banks=[];
      for(let z=town.z-20;z<town.z+20;z++)for(let x=town.x-20;x<town.x+20;x++){
        const i=z*N+x;
        if(this.kind[i]===K.GRASS&&!this.w[i])woods.push(i);
        if(this.w[i]<.04&&this.kind[i]===K.SAND)banks.push(i);
      }
      for (const b of this.buildings.slice(first)) {
        for (const part of b.parts) {
          if(part.role==='roof'){part.sy*=1.3;part.oy+=.12;part.c=[.28,.37,.49];}
          if(part.role==='wall')part.c=[.48,.28,.17];
        }
        if(b.type==='house')for(const side of [-1,1])b.parts.push({role:'wall',g:0,ox:side*(b.w/2+1),oy:.45,oz:b.d/2+1,sx:1.2,sy:.7,sz:.12,ry:0,c:[.42,.29,.22],hp:.5,st:0,char:0,lean:0,dep:-1,ls:side});
        const door=Math.round(b.doorX), z=Math.round(b.doorZ), road=Math.round(79+25*clamp((z-376)/55,0,1));
        for(let x=Math.min(door,road);x<=Math.max(door,road);x++){
          const i=z*N+x;if(!this.bmap[i]&&this.w[i]<.04){this.kind[i]=K.ROAD;this.tree[i]=0;this.fuel[i]=0;}
        }
      }
      const firstNPC=this.npcs.length;
      this.populate(this.buildings.slice(first),random,[],woods,banks,town.x,town.z);
      for(let i=firstNPC;i<this.npcs.length;i++)this.npcs[i].plaza=town;
    }
    this.genCount=this.buildings.length;
    this.spring.push(this.ci(42+9*Math.sin(130/24),450));
  }

  blizzardAt(x,z) {
    const b=this.blizzard;
    return b.remaining>0 ? Math.max(0,1-Math.hypot(x-b.x,z-b.z)/b.r)*Math.min(1,b.remaining/4,b.phase/4) : 0;
  }

  meltCell(i,heat,fracture=false) {
    if (!this.cold || !this.cold[i]) return;
    const snow=Math.min(this.snow[i],Math.ceil(heat*255));
    this.snow[i]-=snow;
    if(this.tree[i]&&snow)this.staticDirty=true;
    this.w[i]+=snow/255*.16;
    this.ice[i]=Math.max(0,this.ice[i]-heat);
    this.thaw[i]=Math.max(this.thaw[i],fracture?45:24);
    if (fracture) this.crack[i]=Math.max(this.crack[i],100);
    this.terrDirty=true;
  }

  stepCold(dt) {
    const b=this.blizzard;
    if(b.remaining>0){b.remaining-=dt;b.phase+=dt;}
    else {
      b.next-=dt;
      if(b.next<=0){b.x=45+hash2(this.day,this.tickN,this.seed)*60;b.z=391+hash2(this.tickN,this.day,this.seed)*50;b.remaining=32;b.phase=0;b.next=105;this.fx.log('A blizzard crosses the Arctic');}
    }
    this.coldStep+=dt;
    if(this.coldStep<.5)return;
    this.coldStep-=.5;
    const start=320*N+this.coldBand++%4, elapsed=2;
    let changed=false;
    for(let i=start;i<NN;i+=4){
      if(!this.cold[i])continue;
      const x=i%N,z=Math.floor(i/N), last=this.snow[i];
      let heat=this.burn[i]>0 || (this.lava.get(i)||0)>.04;
      if(x>0&&x<N-1&&z<ROWS-1)for(const j of [i-1,i+1,i-N,i+N]) heat ||= this.burn[j]>0||(this.lava.get(j)||0)>.04;
      const bi=this.bmap[i], building=bi?this.buildings[bi-1]:null;
      heat ||= building&&building.fire>0;
      if(heat){this.meltCell(i,.3);continue;}
      if(this.thaw[i]>0){this.thaw[i]=Math.max(0,this.thaw[i]-elapsed);continue;}
      const climate=this.cold[i]/255;
      if(this.w[i]>.05 && !(this.flag[i]&2)) {
        const rapid=this.flow[i]>.018;
        this.ice[i]=Math.min(this.w[i],Math.max(0,this.ice[i]+(rapid?-.08:.035*climate)));
      } else this.ice[i]=Math.min(this.ice[i],this.w[i]);
      if(this.w[i]<.04&&!this.burn[i])this.snow[i]=Math.min(this.cold[i],last+1+Math.round(5*this.blizzardAt(x,z)));
      if(this.tree[i]&&(last>>5)!==(this.snow[i]>>5))this.coldTreesDirty=true;
      changed ||= this.snow[i]!==last;
    }
    if(changed)this.coldDirty=true;
  }

  wakeVolcano() {
    const v = this.volcano;
    if (v.state !== 'dormant') return;
    v.state = 'restless'; v.remaining = 7;
    this.fx.log('The southern crater is trembling');
    this.fx.sound('gust',v.x,v.z,0.6);
  }

  emitLava(x,z,I,dt) {
    if (![x,z,I,dt].every(Number.isFinite) || dt<=0 || x<1 || z<1 || x>=N-1 || z>=ROWS-1) return 0;
    const strength=clamp(I,.1,1), radius=1.5+2*strength, extent=Math.ceil(radius), cells=[];
    const xi=Math.round(x),zi=Math.round(z);
    let weight=0;
    for(let dz=-extent;dz<=extent;dz++)for(let dx=-extent;dx<=extent;dx++) {
      const X=xi+dx,Z=zi+dz,distance=Math.hypot(X-x,Z-z);
      if(X<1||Z<1||X>=N-1||Z>=ROWS-1||distance>=radius)continue;
      const share=1-distance/radius;
      cells.push([Z*N+X,share]);weight+=share;
    }
    if(!weight)return 0;
    const amount=(20+60*strength)*Math.min(dt,.2);
    for(const [i,share] of cells)this.lava.set(i,(this.lava.get(i)||0)+amount*share/weight);
    return amount;
  }

  stepVolcano(dt) {
    const v = this.volcano;
    v.remaining -= dt;
    if (v.remaining <= 0) {
      if (v.state === 'dormant') this.wakeVolcano();
      else if (v.state === 'restless') {
        v.state = 'erupting'; v.remaining = 90;
        this.fx.log('The volcano erupts'); this.fx.sound('boom',v.x,v.z,1);
        this.addThreat(v.x,v.z-11,32,90);
      } else { v.state='dormant'; v.remaining=240; }
    }
    v.step += dt;
    if (v.step < 0.2) return;
    v.step -= 0.2;
    if (v.state === 'erupting') this.emitLava(v.x,v.z-3,1,.2);
    if (!this.lava.size) return;
    // Flux uses one snapshot, so iteration order cannot carry a parcel several
    // cells in one step. Only hot cells and their four neighbours do work.
    const next = new Map(this.lava);
    for (const [i,heat] of this.lava) {
      const x=i%N,z=Math.floor(i/N), level=this.h[i]+heat, outlets=[];
      let pressure=0, maxDrop=0;
      // Divide a bounded outflow among every lower neighbour. Diagonal routes
      // widen the stream while the shared budget keeps transfers conservative.
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++) {
        if((!dx&&!dz)||x+dx<0||x+dx>=N||z+dz<0||z+dz>=ROWS)continue;
        const j=i+dz*N+dx, drop=(level-this.h[j]-(this.lava.get(j)||0))/Math.hypot(dx,dz);
        if(drop<=0)continue;
        outlets.push([j,drop]);pressure+=drop;maxDrop=Math.max(maxDrop,drop);
      }
      if(pressure>0) {
        const outflow=Math.min(heat*.8,maxDrop*.36);
        next.set(i,next.get(i)-outflow);
        for(const [j,drop] of outlets)next.set(j,(next.get(j)||0)+outflow*drop/pressure);
      }
      if (heat>0.09) {
        this.meltCell(i,heat);
        this.igniteCell(i);
        const b=this.buildings[this.bmap[i]-1];
        if (b && !b.ruin && !b.gone) { this.igniteB(b); this.damage(b,0.12,'fire',x,z); }
      }
    }
    for (const [i,heat] of next) {
      const wet=this.w[i]>0.08, cool=Math.min(heat,wet ? 0.48 : 0.009);
      if (wet && heat>0.12 && this.rnd()<0.12) this.fx.burst('steam',i%N,this.h[i]+this.w[i],Math.floor(i/N),2,0.5,0.5);
      if (heat-cool <= 0.015) next.delete(i);
      else next.set(i,heat-cool);
      if (heat>0.04 && !this.basalt[i]) {
        this.basalt[i]=1; this.h[i]+=0.09; this.terrDirty=true;
      }
    }
    this.lava=next;
    for (const n of this.npcs) {
      if (n.erased || n.st===DEAD) continue;
      const i=this.ci(n.x,n.z);
      if ((next.get(i)||0)>0.08) {
        n.cause='lava'; n.hp-=0.16;
        if (n.hp<=0) this.kill(n);
        else this.panic(n,i%N,Math.floor(i/N),9);
      }
    }
  }

  ci(x, z) { const xi = clamp((x + 0.5) | 0, 0, N - 1), zi = clamp((z + 0.5) | 0, 0, ROWS - 1); return zi * N + xi; }
  hAt(x, z) { x = x < 0 ? 0 : x > N - 1.001 ? N - 1.001 : x; z = z < 0 ? 0 : z > ROWS - 1.001 ? ROWS - 1.001 : z; const xi = x | 0, zi = z | 0, fx = x - xi, fz = z - zi, i = zi * N + xi, h = this.h; return h[i] * (1 - fx) * (1 - fz) + h[i + 1] * fx * (1 - fz) + h[i + N] * (1 - fx) * fz + h[i + N + 1] * fx * fz; }
  bridgeOK(i) { const s = this.bridge[i]; if (!s) return false; const b = this.bridgeB; return b && b.parts[b.deckIdx[s - 1]].st === 0; }
  walkH(i) { return this.bridgeOK(i) ? this.bridgeB.y : this.h[i]; }

  addB(type, cx, cz, ridgeZ, face, force) {
    const D = { house: [3.2, 3.8, 2.0], tavern: [4.6, 5.2, 2.6], church: [4.4, 8, 3.2], mill: [3.6, 4.4, 2.8], barn: [3.8, 4.8, 2.4], tent: [1.7, 1.7, 1.3] }[type];
    let w = D[0], d = D[1]; const hgt = D[2]; if (!ridgeZ) { const t = w; w = d; d = t; }
    const x0 = Math.ceil(cx - w / 2 - 0.3), x1 = Math.floor(cx + w / 2 + 0.3), z0 = Math.ceil(cz - d / 2 - 0.3), z1 = Math.floor(cz + d / 2 + 0.3);
    if (x0 < 4 || z0 < 4 || x1 > N - 5 || z1 > ROWS - 5) return null;
    let sum = 0, cnt = 0;
    for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) { const i = z * N + x; if (this.bmap[i] || this.w[i] > 0.05) return null; if (!force && (this.rdist(x, z) < 5.5 || (this.kind[i] === K.ROAD && x >= x0 && x <= x1 && z >= z0 && z <= z1))) return null; sum += this.h[i]; cnt++; }
    let y = sum / cnt; if (force && type !== "tent") { let mx = y; for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) mx = Math.max(mx, this.h[z * N + x]); y = (y + mx) / 2; }
    const id = this.buildings.length, g = this.grng;
    const b = { id, type, x: cx, z: cz, y, w, d, hgt, parts: [], fire: 0, fuel: 1, ruin: false, active: false, shake: 0, wet: 0, cells: [], tough: type === 'church' ? 1.7 : type === 'barn' ? 0.85 : type === 'tent' ? 0.5 : 1, flam: type === 'church' ? 0.45 : type === 'tent' ? 1.5 : 1, doorX: cx + face[0] * (w / 2 + 1.1), doorZ: cz + face[1] * (d / 2 + 1.1), logged: false, home: type !== 'bridge', failT: 0 };
    for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) { const i = z * N + x; this.h[i] = y; if (type !== 'tent') this.h0[i] = y; this.tree[i] = 0; if (x >= x0 && x <= x1 && z >= z0 && z <= z1) { this.bmap[i] = id + 1; b.cells.push(i); this.fuel[i] = 0; } }
    const P = (role, geo, ox, oy, oz, sx, sy, sz, ry, c, hp, dep) => { b.parts.push({ role, g: geo, ox, oy, oz, sx, sy, sz, ry: ry || 0, c, hp: hp || 1, st: 0, char: 0, lean: 0, dep: dep === undefined ? -1 : dep, ls: g() < 0.5 ? -1 : 1 }); return b.parts.length - 1; };
    if (type === 'tent') { P('roof', 1, 0, 0.65, 0, 1.7, 1.3, 1.7, 0.6, [0.83, 0.78, 0.66], 0.5); this.buildings.push(b); this.staticDirty = true; this.terrDirty = true; return b; }
    const wallC = type === 'church' ? [0.74, 0.73, 0.7] : type === 'barn' ? [0.6, 0.25, 0.2] : type === 'mill' ? [0.78, 0.7, 0.55] : [[0.87, 0.81, 0.69], [0.8, 0.72, 0.6], [0.9, 0.88, 0.82], [0.76, 0.66, 0.55]][(g() * 4) | 0];
    const roofC = type === 'church' ? [0.33, 0.36, 0.44] : type === 'barn' ? [0.4, 0.3, 0.24] : [[0.62, 0.27, 0.2], [0.72, 0.58, 0.3], [0.5, 0.3, 0.24], [0.68, 0.33, 0.22]][(g() * 4) | 0];
    const tim = [0.36, 0.25, 0.17];
    let bw = w, bd = d, bz = 0, bx = 0;
    if (type === 'church') { if (ridgeZ) { bd = d - 2; bz = 1; } else { bw = w - 2; bx = 1; } }
    P('base', 0, 0, 0.06, 0, w + 0.5, 0.14, d + 0.5, 0, [0.52, 0.5, 0.47]);
    for (const sxn of [-1, 1]) for (const szn of [-1, 1]) P('sup', 0, bx + sxn * bw / 2, hgt / 2, bz + szn * bd / 2, 0.3, hgt, 0.3, 0, tim);
    const wf = P('wall', 0, bx, hgt / 2, bz - bd / 2, bw, hgt, 0.18, 0, wallC), wbk = P('wall', 0, bx, hgt / 2, bz + bd / 2, bw, hgt, 0.18, 0, wallC);
    const wl = P('wall', 0, bx - bw / 2, hgt / 2, bz, 0.18, hgt, bd, 0, wallC), wr = P('wall', 0, bx + bw / 2, hgt / 2, bz, 0.18, hgt, bd, 0, wallC);
    const rh = Math.min(bw, bd) * 0.42; let r1;
    if (bd >= bw) { r1 = P('roof', 2, bx, hgt + rh / 2, bz - bd / 4, bw + 0.6, rh, bd / 2 + 0.25, 0, roofC, 0.8); P('roof', 2, bx, hgt + rh / 2, bz + bd / 4, bw + 0.6, rh, bd / 2 + 0.25, 0, roofC, 0.8); }
    else { r1 = P('roof', 2, bx - bw / 4, hgt + rh / 2, bz, bd + 0.6, rh, bw / 2 + 0.25, Math.PI / 2, roofC, 0.8); P('roof', 2, bx + bw / 4, hgt + rh / 2, bz, bd + 0.6, rh, bw / 2 + 0.25, Math.PI / 2, roofC, 0.8); }
    const dw = face[0] ? (face[0] < 0 ? wl : wr) : (face[1] < 0 ? wf : wbk);
    if (face[0]) P('decor', 0, bx + face[0] * (bw / 2 + 0.06), 0.55, bz, 0.1, 1.1, 0.7, 0, tim, 1, dw); else P('decor', 0, bx, 0.55, bz + face[1] * (bd / 2 + 0.06), 0.7, 1.1, 0.1, 0, tim, 1, dw);
    if (type === 'house' || type === 'tavern') P('decor', 0, bx + (bd >= bw ? bw * 0.22 : -bw * 0.25), hgt + rh * 0.75, bz + (bd >= bw ? -bd * 0.25 : bd * 0.2), 0.42, rh * 0.9, 0.42, 0, [0.45, 0.4, 0.38], 1, r1);
    // windows
    if (face[0]) { P('decor', 0, bx + face[0] * (bw / 2 + 0.05), hgt * 0.62, bz + bd * 0.3, 0.08, 0.5, 0.5, 0, [0.2, 0.24, 0.3], 1, dw).valueOf(); b.parts[b.parts.length - 1].win = 1; P('decor', 0, bx + face[0] * (bw / 2 + 0.05), hgt * 0.62, bz - bd * 0.3, 0.08, 0.5, 0.5, 0, [0.2, 0.24, 0.3], 1, dw); b.parts[b.parts.length - 1].win = 1; }
    else { P('decor', 0, bx + bw * 0.3, hgt * 0.62, bz + face[1] * (bd / 2 + 0.05), 0.5, 0.5, 0.08, 0, [0.2, 0.24, 0.3], 1, dw); b.parts[b.parts.length - 1].win = 1; P('decor', 0, bx - bw * 0.3, hgt * 0.62, bz + face[1] * (bd / 2 + 0.05), 0.5, 0.5, 0.08, 0, [0.2, 0.24, 0.3], 1, dw); b.parts[b.parts.length - 1].win = 1; }
    if (type === 'church') { const tx = ridgeZ ? 0 : -w / 2 + 1, tz = ridgeZ ? -d / 2 + 1 : 0; const t = P('wall', 0, tx, 3.2, tz, 1.9, 6.4, 1.9, 0, wallC, 1.3); P('roof', 1, tx, 6.4 + 1.3, tz, 2.3, 2.6, 2.3, 0, roofC, 0.8, t); }
    if (type === 'mill') { P('decor', 0, ridgeZ ? -w / 2 - 0.2 : 0, 1.3, ridgeZ ? 0 : -d / 2 - 0.2, ridgeZ ? 0.25 : 2.2, 2.2, ridgeZ ? 2.2 : 0.25, 0, tim, 1, ridgeZ ? wl : wf); }
    this.buildings.push(b); this.staticDirty = true; this.terrDirty = true; return b;
  }

  addBridge(xa, xb, z) {
    const len = xb - xa, dy = Math.max(this.h[z * N + xa], this.h[z * N + xb]) + 0.3;
    const b = { id: this.buildings.length, type: 'bridge', x: (xa + xb) / 2, z: z + 0.5, y: dy, w: len, d: 2.4, hgt: 0.4, parts: [], fire: 0, fuel: 1, ruin: false, active: false, shake: 0, wet: 0, cells: [], tough: 1.2, flam: 0.5, doorX: xa, doorZ: z, home: false, deckIdx: [], logged: false, failT: 0 };
    const tim = [0.42, 0.3, 0.2], P = (role, ox, oy, oz, sx, sy, sz, dep) => { b.parts.push({ role, g: 0, ox, oy, oz, sx, sy, sz, ry: 0, c: role === 'sup' ? [0.5, 0.48, 0.45] : tim, hp: 1, st: 0, char: 0, lean: 0, dep: dep === undefined ? -1 : dep, ls: 1 }); return b.parts.length - 1; };
    const sl = len / 3;
    for (let k = 0; k < 3; k++) { const di = P('deck', -len / 2 + sl * (k + 0.5), -0.1, 0, sl + 0.5, 0.22, 2.4); b.deckIdx.push(di); P('decor', -len / 2 + sl * (k + 0.5), 0.3, -1.15, sl, 0.12, 0.1, di); P('decor', -len / 2 + sl * (k + 0.5), 0.3, 1.15, sl, 0.12, 0.1, di); }
    for (let k = 1; k < 3; k++) for (const s of [-1, 1]) { const px = -len / 2 + sl * k; const gh = this.h[z * N + Math.round(b.x + px)]; const ph = dy - gh + 0.4; P('sup', px, -ph / 2, s * 0.9, 0.4, ph, 0.4); }
    for (let x = xa; x <= xb; x++) for (let dz = 0; dz < 2; dz++) this.bridge[(z + dz) * N + x] = 1 + Math.min(2, ((x - xa) / sl) | 0);
    this.buildings.push(b); this.bridgeB = b;
  }

  // ------------------------------------------------------------ water
  stepWater() { this.flowStep(); this.flowStep(); this.flowStep(); if (!this.settling) this.waterExtras(); }
  flowStep() {
    const h = this.h, w = this.w, dw = this.dw, fl = this.flow, flx = this.flx, flz = this.flz, ice=this.ice;
    const rows = this.settling ? N : ROWS;
    for (let z = 0; z < rows; z++) {
      let i = z * N;
      for (let x = 0; x < N; x++, i++) {
        const wi = (i<320*N||!ice?w[i]:Math.max(0,w[i]-ice[i])); let a = 0, bq = 0;
        if (x < N - 1) { const j = i + 1, wj = (j<320*N||!ice?w[j]:Math.max(0,w[j]-ice[j])); if (wi > 0 || wj > 0) { const dl = h[i] + w[i] - h[j] - w[j]; let f; if (dl > 0) { f = dl * 0.12 * Math.min(1.6, 0.08 + wi * 2.3); const m = wi * 0.24; if (f > m) f = m; } else { f = dl * 0.12 * Math.min(1.6, 0.08 + wj * 2.3); const m = -wj * 0.24; if (f < m) f = m; } dw[i] -= f; dw[j] += f; a = f; } }
        if (z < rows - 1) { const j = i + N, wj = (j<320*N||!ice?w[j]:Math.max(0,w[j]-ice[j])); if (wi > 0 || wj > 0) { const dl = h[i] + w[i] - h[j] - w[j]; let f; if (dl > 0) { f = dl * 0.12 * Math.min(1.6, 0.08 + wi * 2.3); const m = wi * 0.24; if (f > m) f = m; } else { f = dl * 0.12 * Math.min(1.6, 0.08 + wj * 2.3); const m = -wj * 0.24; if (f < m) f = m; } dw[i] -= f; dw[j] += f; bq = f; } }
        flx[i] = flx[i] * 0.9 + a * 0.1; flz[i] = flz[i] * 0.9 + bq * 0.1;
        fl[i] = Math.abs(flx[i]) + Math.abs(flz[i]);
      }
    }
    const flag = this.flag;
    for (let i = 0; i < rows * N; i++) { let v = w[i] + dw[i]; dw[i] = 0; if ((flag[i] & 2) && (this.settling || !this.inEstuary(i))) v = Math.max(0, -h[i]); else if (v < 0) v = 0; w[i] = v; if(i>=320*N&&ice)ice[i]=Math.min(ice[i],v); }
    for (const i of this.spring) w[i] += 0.013;
  }
  waterExtras() {
    const h = this.h, w = this.w, fl = this.flow, flag = this.flag, t = this.tickN;
    if (this.seepHold > 0) this.seepHold--; else if (this.craterCells.length) { const h0 = this.h0; for (const i of this.craterCells) if (h[i] < h0[i] - 1 && h[i] + w[i] < h0[i] - 0.7) w[i] += 0.0005; }
    if (this.rain > 0) { const r = this.rain * 0.00004; for (let i = 0; i < NN; i++) if (h[i] > 0) w[i] += r; }
    if (t % 8 === 0) {
      const off = (t / 8) % 4, wb = this.wb, f0 = this.f0, h0 = this.h0, kind = this.kind, mud = this.mud; let ch = false;
      for (let i = off; i < NN; i += 4) {
        const wi = w[i]; if (wi <= 0) { if (wb[i] > 0) wb[i] *= 0.97; continue; }
        const ex = wi - wb[i];
        if (ex > 0.3 && mud[i] < 250) { mud[i] += 5; ch = true; if (kind[i] === K.FARM || kind[i] === K.GRASS) this.fuel[i] = Math.min(this.fuel[i], 0.06); }
        wb[i] += ex * (this.clock < 45 ? 0.5 : 0.008);
        // Water transports depth only. Landscape powers own terrain deformation.
      }
      if (ch) this.terrDirty = true;
    }
  }

  // ------------------------------------------------------------ fire
  igniteCell(i) { this.meltCell(i,.32); if (this.burn[i] > 0 || this.fuel[i] < 0.03 || this.w[i] > 0.03) return false; this.burn[i] = 0.3; this.fires.push(i); if (this.tree[i] === 1) { this.tree[i] = 2; this.staticDirty = true; } this.terrDirty = true; return true; }
  igniteB(b) { if (b.gone || b.fire > 0 || b.fuel <= 0 || b.ruin || b.wet > 0.4 || b.cells.some(i => this.w[i] > 0.4 && this.h[i] + this.w[i] > b.y + 0.4)) return; b.fire = 0.2; b.active = true; this.addThreat(b.x, b.z, 6, 5); if (!b.logF) { b.logF = true; this.fx.log(this.bname(b) + ' is on fire'); } }
  bname(b) { return b.type === 'house' ? 'A house' : 'The ' + b.type; }
  stepFire(dt) {
    const F = this.fires, burn = this.burn, fuel = this.fuel, w = this.w, h = this.h, rnd = this.rnd, wx = this.wind[0], wz = this.wind[1], rainF = this.rain > 0.3 ? 0.4 : 1;
    for (let k = F.length - 1; k >= 0; k--) {
      const i = F[k]; let out = false;
      if (w[i] > 0.05) { out = true; this.scorch[i] = Math.max(this.scorch[i], 140); }
      else {
        fuel[i] -= (this.kind[i] === K.FOREST ? 0.07 : 0.11) * dt; burn[i] = Math.min(1, burn[i] + dt * 1.5);
        if (this.rain > 0.3 && this.kind[i] !== K.FOREST && rnd() < 0.02) out = true;
        if (fuel[i] <= 0) { fuel[i] = 0; out = true; this.scorch[i] = 255; }
      }
      if (out) { burn[i] = 0; if (this.tree[i] === 2) { this.tree[i] = 3; this.staticDirty = true; } F[k] = F[F.length - 1]; F.pop(); this.terrDirty = true; continue; }
      const x = i % N, z = (i / N) | 0; if (x < 1 || z < 1 || x > N - 2 || z > ROWS - 2) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const j = i + dz * N + dx;
        const bi = this.bmap[j]; if (bi) { const b = this.buildings[bi - 1]; if (!b.fire && b.fuel > 0 && rnd() < 0.012 * b.flam) this.igniteB(b); continue; }
        if (burn[j] > 0 || fuel[j] < 0.03) continue;
        const dg = dx && dz ? 0.7071 : 1;
        const wf = Math.max(0.12, 1 + 1.7 * (dx * wx + dz * wz) * dg), sl = clamp(1 + (h[j] - h[i]) * 0.5, 0.6, 1.8);
        if (rnd() < dt * 0.24 * (0.08 + fuel[j]) * wf * sl * dg * burn[i] * rainF) this.igniteCell(j);
      }
      if (rnd() < 0.006 * this.windS * rainF) { const r = 3 + rnd() * 5, tx = Math.round(x + wx * r + rnd() * 2 - 1), tz = Math.round(z + wz * r + rnd() * 2 - 1); if (tx > 0 && tz > 0 && tx < N - 1 && tz < ROWS - 1) this.igniteCell(tz * N + tx); }
    }
  }

  // ------------------------------------------------------------ structures
  damage(b, amt, type, ox, oz, pow) {
    if (!b || b.ruin || b.gone) return; const V = VULN[type] || VULN.stress; b.active = true;
    for (const p of b.parts) {
      if (p.st || p.role === 'base' || p.role === 'decor') continue;
      const v = V[p.role] || 1; p.hp -= amt * v * (0.6 + 0.8 * this.rnd()) / b.tough;
      if (type !== 'fire' && type !== 'flood') p.lean = Math.min(1, p.lean + amt * v * 0.45);
      if (p.hp <= 0) this.failPart(b, p, type, ox, oz, pow);
    }
  }
  hit(b, role, amt, type) { for (const p of b.parts) if (!p.st && p.role === role) { p.hp -= amt * (0.5 + this.rnd()) / b.tough; p.lean = Math.min(1, p.lean + amt * 0.3); if (p.hp <= 0) this.failPart(b, p, type || 'stress', b.x, b.z, 0); } }
  failPart(b, p, type, ox, oz, pow) {
    if (p.st) return; p.st = 1; b.active = true; b.failT = 0.6;
    const rnd = this.rnd, px = b.x + p.ox, py = b.y + p.oy, pz = b.z + p.oz, ch = p.char, c = [p.c[0] * (1 - 0.75 * ch), p.c[1] * (1 - 0.8 * ch), p.c[2] * (1 - 0.8 * ch)];
    const vol = p.sx * p.sy * p.sz;
    if (type === 'crush') {
      const gy = this.hAt(px, pz);
      this.addRubble(px + rnd() * 0.4 - 0.2, gy + 0.06, pz + rnd() * 0.4 - 0.2, Math.max(p.sx, 0.3) * 1.05, 0.1, Math.max(p.sz, p.sy * 0.5, 0.3), 0, p.ry + rnd() * 0.5, 0, p.g === 2 ? 0 : p.g, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8);
    } else {
      let dx = p.ox, dz = p.oz, vx, vy, vz, wxa = 0, wza = 0, wya = 0;
      if (type === 'blast') { dx = px - ox; dz = pz - oz; const l = Math.hypot(dx, dz) || 1, sp = (5 + 9 * rnd()) * (0.6 + (pow || 0.5)); vx = dx / l * sp; vz = dz / l * sp; vy = 4 + 8 * rnd(); wxa = rnd() * 10 - 5; wza = rnd() * 10 - 5; wya = rnd() * 6 - 3; }
      else if (type === 'wind') { dx = px - ox; dz = pz - oz; const l = Math.hypot(dx, dz) || 1, sp = (4 + 9 * rnd()) * (0.45 + (pow || 0.5)); const tx = -dz / l, tz = dx / l; vx = dx / l * sp + tx * sp * 0.65; vz = dz / l * sp + tz * sp * 0.65; vy = 3.5 + 8 * rnd(); wxa = rnd() * 9 - 4.5; wza = rnd() * 9 - 4.5; wya = rnd() * 6 - 3; }
      else {
        const l = Math.hypot(dx, dz); if (l < 0.2) { const a = rnd() * 6.28; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= l; dz /= l; }
        if (p.role === 'roof' || p.role === 'deck') { vx = dx * 0.4; vz = dz * 0.4; vy = -0.5; wxa = rnd() * 1.6 - 0.8; wza = rnd() * 1.6 - 0.8; }
        else { const sp = 0.8 + rnd() * 1.6; vx = dx * sp; vz = dz * sp; vy = 0.6; const wm = 1.6 + rnd() * 1.6; wxa = dz * wm; wza = -dx * wm; }
      }
      this.debris.push({ x: px, y: py, z: pz, vx, vy, vz, rx: 0, ry: p.ry, rz: 0, wx: wxa, wy: wya, wz: wza, sx: p.sx, sy: p.sy, sz: p.sz, g: p.g, c, b: 0, from: b.id, mass: vol, hot: 0 });
      const nch = vol > 0.3 ? 2 : 1;
      for (let k = 0; k < nch; k++) { const s = 0.2 + rnd() * 0.35; this.debris.push({ x: px + (rnd() - 0.5) * p.sx, y: py + (rnd() - 0.5) * p.sy, z: pz + (rnd() - 0.5) * p.sz, vx: (vx || 0) * 0.7 + rnd() * 3 - 1.5, vy: (vy || 0) + rnd() * 3, vz: (vz || 0) * 0.7 + rnd() * 3 - 1.5, rx: 0, ry: rnd() * 6, rz: 0, wx: rnd() * 8 - 4, wy: 0, wz: rnd() * 8 - 4, sx: s, sy: s * 0.7, sz: s, g: 0, c: [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85], b: 0, from: b.id, mass: 0.05, hot: 0 }); }
    }
    this.fx.burst('dust', px, py, pz, 5 + Math.min(10, vol * 3 | 0), Math.max(p.sx, p.sz) * 0.6, 1);
    this.fx.sound(p.role === 'decor' ? 'crack' : 'collapse', px, pz, clamp(0.25 + vol * 0.12, 0.2, 1));
    this.addThreat(b.x, b.z, 7, 4);
    for (const q of b.parts) if (!q.st && q.role !== 'base' && q.role !== 'decor') { q.hp -= 0.07 * rnd(); q.lean = Math.min(1, q.lean + 0.09); }
    for (const n of this.npcs) if (n.home === b.id && n.inside && n.st !== DEAD) { if (type === 'crush' || type === 'blast' || rnd() < 0.25) { n.hp -= type === 'crush' || type === 'blast' ? 0.6 : 0.3; n.cause = 'buried'; } n.inside = false; n.x = b.doorX; n.z = b.doorZ; this.panic(n, b.x, b.z, 9); }
    if (!b.logged) { b.logged = true; this.fx.log(this.bname(b) + ' is breaking apart'); }
  }
  addRubble(x, y, z, sx, sy, sz, rx, ry, rz, g, r, gg, bb) { this.rubble.push([x, y, z, sx, sy, sz, rx, ry, rz, g, r, gg, bb]); if (this.rubble.length > 2400) this.rubble.splice(0, 300); this.staticDirty = true; }

  tickB(b, dt) {
    if (b.gone) { b.active = false; b.fire = 0; return; }
    const rnd = this.rnd; let stress = false;
    b.y = b.type === 'bridge' ? b.y : this.h[this.ci(b.x, b.z)];
    if (b.failT > 0) b.failT -= dt;
    // Suppress fire before applying burn damage or spreading embers.
    if (b.wet > 0.18 && b.fire > 0) b.fire = Math.max(0, b.fire - dt * (1 + b.wet * 3));
    if (b.wet > 0.8) b.fire = 0;
    if (b.fire > 0) {
      b.fire = Math.min(1, b.fire + dt * 0.25); b.fuel -= dt * 0.012 * (this.rain > 0.3 ? 0.6 : 1);
      this.damage(b, dt * 0.04 * b.fire * b.flam, 'fire', b.x, b.z);
      for (const p of b.parts) if (!p.st && p.role !== 'base') p.char = Math.min(1, p.char + dt * 0.05 * b.fire * (p.role === 'roof' ? 1.4 : 0.8));
      if (rnd() < dt * 0.45 && b.cells.length) { const i = b.cells[(rnd() * b.cells.length) | 0], x = i % N + ((rnd() * 5) | 0) - 2, z = ((i / N) | 0) + ((rnd() * 5) | 0) - 2; const j = clamp(z, 1, ROWS - 2) * N + clamp(x, 1, N - 2); const bi = this.bmap[j]; if (bi && bi - 1 !== b.id) { if (rnd() < 0.25) this.igniteB(this.buildings[bi - 1]); } else this.igniteCell(j); }
      if (rnd() < dt * 0.85 * (0.35 + b.fire)) { let best = null, bd = 5.75; for (const o of this.buildings) { if (o === b || o.gone || o.ruin || o.fire > 0 || o.fuel <= 0) continue; const d = Math.hypot(o.x - b.x, o.z - b.z); if (d < bd) { bd = d; best = o; } } if (best && rnd() < 0.8 * b.flam * best.flam * (1.2 - bd / 5.75)) this.igniteB(best); }
      if (b.fuel <= 0 || b.wet > 0.8) { b.fire = 0; b.burnt = true; if (b.fuel <= 0) b.fuel = 0; }
      stress = true;
    }
    if (b.wet > 0.18) { this.damage(b, dt * 0.1 * Math.min(2.5, b.wet + 0.1), 'flood', b.x, b.z); stress = true; }
    let sA = 0, sT = 0, wA = 0, wT = 0, rA = 0, alive = 0;
    for (const p of b.parts) { if (p.role === 'sup') { sT++; if (!p.st) sA++; } else if (p.role === 'wall') { wT++; if (!p.st) wA++; } else if (p.role === 'roof' || p.role === 'deck') { if (!p.st) rA++; } if (!p.st && p.role !== 'base' && p.role !== 'decor') alive++; }
    if (b.type !== 'tent') {
      // Roof load also depends on surviving supports' health, not only their count.
      let strength = 0;
      for (const p of b.parts) if (p.role === 'sup' && !p.st) strength += clamp(p.hp, 0, 1);
      if (sT && rA && strength / sT < 0.5) {
        this.hit(b, b.type === 'bridge' ? 'deck' : 'roof', dt * (0.5 - strength / sT) * 0.6);
        stress = true;
      }
      if (rA && sT && sA / sT < 0.75) { this.hit(b, b.type === 'bridge' ? 'deck' : 'roof', dt * (sA / sT < 0.4 ? 0.9 : 0.3)); stress = true; }
      if (wT) { if (wA / wT < 0.6) { if (rA) this.hit(b, 'roof', dt * 0.8); if (sA) this.hit(b, 'sup', dt * 0.35); stress = true; } if (sA === 0 && wA) { this.hit(b, 'wall', dt * 0.35); stress = true; } if (rA === 0 && wA && wA < wT) { this.hit(b, 'wall', dt * 0.12); stress = true; } }
    }
    for (const p of b.parts) { if (p.st || p.role === 'base') continue; const doomed = p.hp <= 0 || (p.dep >= 0 && b.parts[p.dep] && b.parts[p.dep].st); if (!doomed) { p.failIn = 0; continue; } if (!p.failIn) p.failIn = 0.12 + rnd() * 0.38; p.failIn -= dt; if (p.failIn <= 0) { this.failPart(b, p, 'stress', b.x, b.z, 0); stress = true; } }
    if (alive === 0 && !b.ruin) { b.ruin = true; b.fire = 0; this.fx.log(this.bname(b) + (b.type === 'bridge' ? ' has fallen' : b.type === 'tent' ? ' is gone' : ' has collapsed')); for (const n of this.npcs) if (n.home === b.id && n.inside && n.st !== DEAD) { n.inside = false; n.cause = 'buried'; this.kill(n); } }
    b.active = !b.ruin && (stress || b.failT > 0 || b.shake > 0);
  }

  plantDebris(d) {
    const rnd = this.rnd, i = this.ci(d.x, d.z), half = Math.min(d.sx, d.sy, d.sz) * 0.5, gy = this.hAt(d.x, d.z);
    if (d.mass > 0.4) {
      this.fx.burst('dust', d.x, gy, d.z, 4, 0.6, 0.7); this.fx.sound('thud', d.x, d.z, clamp(d.mass * 0.2, 0.2, 0.8));
      const bi = this.bmap[i]; if (bi && bi - 1 !== d.from && d.mass > 1.2) { const b2 = this.buildings[bi - 1]; if (b2 && !b2.ruin && !b2.gone) this.damage(b2, 0.2 + Math.min(0.5, d.mass * 0.08), 'impact', d.x, d.z); }
      for (const n of this.npcs) if (!n.erased && n.st !== DEAD && !n.inside && Math.abs(n.x - d.x) < 1.1 && Math.abs(n.z - d.z) < 1.1) { n.hp -= 0.45; n.cause = 'crushed by debris'; this.panic(n, d.x, d.z, 6); }
    }
    if (this.w[i] > 0.25) this.fx.burst('splash', d.x, this.h[i] + this.w[i], d.z, 4, 0.3, 1);
    if (d.hot && rnd() < 0.4) this.igniteCell(i);
    let rx = (rnd() - 0.5) * 0.3, rz = (rnd() - 0.5) * 0.3, sy = d.sy, y = gy - half;
    if (d.g === 0 && d.sy > Math.min(d.sx, d.sz) * 1.5) { rx = Math.PI / 2 + rx; y += Math.min(d.sx, d.sz) * 0.5; }
    else if (d.g === 2 || d.g === 1) { sy *= 0.55; y += sy * 0.45; rz += (rnd() < 0.5 ? -0.35 : 0.35); }
    else y += d.sy * 0.5;
    if (this.w[i] < 1.2) this.addRubble(d.x, y, d.z, d.sx, sy, d.sz, rx, d.ry, rz, d.g, d.c[0], d.c[1], d.c[2]);
  }
  stepDebris(dt) {
    const D = this.debris;
    while (D.length > 420) { this.plantDebris(D[0]); D[0] = D[D.length - 1]; D.pop(); }
    for (let k = D.length - 1; k >= 0; k--) {
      const d = D[k]; d.vy -= 20 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
      if (d.x < 1 || d.z < 1 || d.x > N - 2 || d.z > ROWS - 2) { D[k] = D[D.length - 1]; D.pop(); continue; }
      const bi = this.bmap[this.ci(d.x, d.z)];
      if (bi && bi - 1 !== d.from) {
        const b = this.buildings[bi - 1];
        if (b && !b.gone && !b.ruin && b.type !== 'bridge') {
          const top = b.y + Math.max(0.4, b.hgt);
          if (d.y >= top && d.y < top + Math.max(d.sy, 0.5) && d.vy <= 0) { d.y = top + Math.min(d.sx, d.sy, d.sz) * 0.5; d.vy = Math.abs(d.vy) * 0.22; d.vx *= 0.55; d.vz *= 0.55; if (d.mass > 0.8) this.damage(b, 0.08 + Math.min(0.22, d.mass * 0.04), 'impact', d.x, d.z); continue; }
          if (d.y < top && d.y > b.y - 0.25 && (d.hitB || 0) < 2) { const dx = d.x - b.x, dz = d.z - b.z, l = Math.hypot(dx, dz) || 1; d.x += dx / l * 0.4; d.z += dz / l * 0.4; d.vx = dx / l * (2.2 + Math.abs(d.vx) * 0.45); d.vz = dz / l * (2.2 + Math.abs(d.vz) * 0.45); d.vy = Math.max(d.vy, 1.4); d.hitB = (d.hitB || 0) + 1; if (d.mass > 0.6) this.damage(b, 0.06, 'impact', d.x, d.z); continue; }
        }
      }
      const half = Math.min(d.sx, d.sy, d.sz) * 0.5, gy = this.hAt(d.x, d.z) + half;
      if (d.y > gy) continue;
      if (d.vy < -5 && d.b < 1) { d.y = gy; d.vy = -d.vy * 0.25; d.vx *= 0.5; d.vz *= 0.5; d.wx *= 0.5; d.wz *= 0.5; d.b++; if (d.mass > 0.5) { this.fx.burst('dust', d.x, d.y, d.z, 3, 0.5, 0.6); this.fx.sound('thud', d.x, d.z, 0.4); } continue; }
      this.plantDebris(d);
      D[k] = D[D.length - 1]; D.pop();
    }
  }

  // ------------------------------------------------------------ threats / npcs
  addThreat(x, z, r, ttl) { this.threats.push({ x, z, r, ttl }); }
  panicSound(x, z, vol) {
    if (this.screamT > 0) return;
    this.screamT = 0.65; this.fx.sound('scream', x, z, vol);
  }
  rebuildHazards() {
    const a = this.hazards; a.fill(0);
    const paint = (x, z, r) => {
      const x0 = Math.max(1, Math.floor(x-r)), x1 = Math.min(N-2, Math.ceil(x+r));
      const z0 = Math.max(1, Math.floor(z-r)), z1 = Math.min(ROWS-2, Math.ceil(z+r));
      for (let Z=z0; Z<=z1; Z++) for (let X=x0; X<=x1; X++) {
        const v = 1 - Math.hypot(X-x,Z-z)/r, i=Z*N+X;
        if (v > a[i]) a[i] = v;
      }
    };
    for (const [i,heat] of this.lava) if (heat>0.08) a[i]=1;
    for (const t of this.threats) paint(t.x,t.z,t.r);
    for (const t of this.tornados) paint(t.x,t.z,t.R*2.55);
    for (const m of this.meteors) paint(m.x,m.z,10+12*m.I);
    for (const b of this.buildings) if (!b.gone && b.fire>0) paint(b.x,b.z,Math.max(b.w,b.d)/2+4);
  }
  dangerAt(n) {
    const T = this.threats; for (let k = 0; k < T.length; k++) { const t = T[k], dx = n.x - t.x, dz = n.z - t.z; if (dx * dx + dz * dz < t.r * t.r) return t; }
    const f = this.finger; if (f) { const dx = n.x - f.x, dz = n.z - f.z; if (dx * dx + dz * dz < f.r * f.r) return f; }
    for (const m of this.meteors) { const dx = n.x - m.x, dz = n.z - m.z, R = 10 + 12 * m.I; if (dx * dx + dz * dz < R * R) return { x: m.x, z: m.z, r: R * 0.45 }; }
    for (const q of this.tornados) { const dx = n.x - q.x, dz = n.z - q.z, R = q.R * 3.1; if (dx * dx + dz * dz < R * R) return { x: q.x, z: q.z, r: q.R * 1.5 }; }
    for (const b of this.buildings) if (!b.gone && b.fire > 0 && Math.hypot(n.x-b.x,n.z-b.z) < Math.max(b.w,b.d)/2+4) return {x:b.x,z:b.z,r:Math.max(b.w,b.d)/2+4};
    const own = this.ci(n.x,n.z);
    if (this.w[own] > 0.45 && !this.bridgeOK(own)) return {x:n.x,z:n.z,r:7};
    const xi = (n.x + 0.5) | 0, zi = (n.z + 0.5) | 0; let sx = 0, sz = 0, c = 0;
    for (let k = 0; k < SCAN.length; k += 2) { const x = xi + SCAN[k], z = zi + SCAN[k + 1]; if (x < 0 || z < 0 || x >= N || z >= ROWS) continue; const i = z * N + x; if (this.burn[i] > 0 || (this.lava.size && this.lava.has(i)) || (this.w[i] > 0.18 && this.w[i] - this.wb[i] > 0.15 && !this.bridgeOK(i))) { sx += x; sz += z; c++; } }
    if (c) { this._dg.x = sx / c; this._dg.z = sz / c; this._dg.r = 7; return this._dg; }
    return null;
  }
  panic(n, fx, fz, r) {
    if (n.st === DEAD) return; n.tx = fx; n.tz = fz; n.tr = r || 7; n.calm = 0; this.alarm = 22;
    if (n.inside) { n.inside = false; const b = this.buildings[n.home]; if (b) { n.x = b.doorX; n.z = b.doorZ; } }
    if (n.st !== PANIC && n.st !== STUMBLE) { n.st = PANIC; n.path = null; n.goal = ''; n.working = false; this.pickFlee(n); this.panicSound(n.x, n.z, 0.7); }
  }
  safeCell(i) { return this.h[i] > 0.3 && this.hazards[i] < 0.45 && this.burn[i] === 0 && (this.w[i] < 0.3 || this.bridgeOK(i)) && !(this.bmap[i] && !this.buildings[this.bmap[i] - 1].ruin); }
  pickFlee(n) {
    if ((n.fleeT || 0) > 0) return;
    n.fleeT = 0.6;
    const rnd = this.rnd, base = Math.atan2(n.z - n.tz, n.x - n.tx) + (n.x === n.tx && n.z === n.tz ? rnd() * 6.28 : 0); let best = -1e9, bx = n.x, bz = n.z;
    for (let k = 0; k < 7; k++) {
      const a = base + (rnd() - 0.5) * (0.8 + k * 0.5), dist = (n.tr || 7) + 9 + rnd() * 14, x = clamp(n.x + Math.cos(a) * dist, 6, N - 7), z = clamp(n.z + Math.sin(a) * dist, 6, ROWS - 7), i = this.ci(x, z);
      if (!this.safeCell(i)) continue; const sc = Math.cos(a - base) * 8 + this.h[i] * 1.2 - this.hazards[i] * 30 - (n.badGoal === i ? 20 : 0) + rnd() * 2; if (sc > best) { best = sc; bx = x; bz = z; }
    }
    n.gx = bx; n.gz = bz; this.reqPath(n, bx, bz);
  }
  reqPath(n, x, z) { n.px = x; n.pz = z; if (!n.queued) { n.queued = true; this.pathQ.push(n); } }
  kill(n) { if (n.st === DEAD) return; n.st = DEAD; n.hp = 0; n.path = null; n.inside = false; n.deadT = 0; this.fx.log(n.name + ' the ' + n.job + ' has died' + (n.cause ? ' (' + n.cause + ')' : '')); }

  passCost(i, from, n) {
    const bi = this.bmap[i]; let c = 1.15, ruin = false;
    if (bi) { if (!this.buildings[bi - 1].ruin) return -1; ruin = true; }
    const br = this.bridgeOK(i), wd = br ? 0 : this.w[i];
    if (wd > 0.45 || this.burn[i] > 0.02 || (this.lava.size && this.lava.has(i))) return -1;
    const hi = br ? this.bridgeB.y : this.h[i]; if (hi < 0.05) return -1;
    const dh = Math.abs(hi - this.walkH(from)); if (dh > 1.15) return -1;
    const k = this.kind[i]; if (k === K.ROAD) c = 0.8; else if (k === K.FOREST) c = 1.7;
    const hazard = this.hazards[i];
    if (hazard > 0.8 && hazard > this.hazards[from] + 0.05) return -1;
    return c + wd * 6 + dh * 1.5 + (ruin ? 2 : 0) + hazard * 18;
  }
  findPath(si, ti) {
    if (si === ti) return [];
    const g = this._g, came = this._came, st = this._st, hi = this._hi, hf = this._hf, stamp = (this._stamp += 2), tx = ti % N, tz = (ti / N) | 0;
    let hn = 0, exp = 0, best = si, bestH = 1e9;
    const push = (i, f) => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hi[k] = hi[p]; hf[k] = hf[p]; k = p; } hi[k] = i; hf[k] = f; };
    g[si] = 0; st[si] = stamp; came[si] = -1; push(si, 0);
    while (hn > 0 && exp < 7000) {
      const i = hi[0]; hn--; if (hn > 0) { const li = hi[hn], lf = hf[hn]; let k = 0; for (; ;) { let c = k * 2 + 1; if (c >= hn) break; if (c + 1 < hn && hf[c + 1] < hf[c]) c++; if (hf[c] >= lf) break; hi[k] = hi[c]; hf[k] = hf[c]; k = c; } hi[k] = li; hf[k] = lf; }
      if (st[i] === stamp + 1) continue; st[i] = stamp + 1; exp++;
      if (i === ti) { best = ti; break; }
      const x = i % N, z = (i / N) | 0, hd = Math.abs(x - tx) + Math.abs(z - tz); if (hd < bestH) { bestH = hd; best = i; }
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const nx = x + dx, nz = z + dz; if (nx < 1 || nz < 1 || nx > N - 2 || nz > ROWS - 2) continue;
        const j = nz * N + nx; if (st[j] === stamp + 1) continue;
        const c = this.passCost(j, i); if (c < 0) continue;
        if (dx && dz && (this.passCost(i + dx, i) < 0 || this.passCost(i + dz * N, i) < 0)) continue;
        const ng = g[i] + c * (dx && dz ? 1.414 : 1);
        if (st[j] === stamp && ng >= g[j]) continue;
        g[j] = ng; st[j] = stamp; came[j] = i; if (hn < hi.length - 1) push(j, ng + Math.hypot(nx - tx, nz - tz) * 0.85);
      }
    }
    const out = []; let c = best; while (c !== si && c >= 0) { out.push(c); c = came[c]; } out.reverse(); return out;
  }

  move(n, speed, dt) { // returns 1 arrived, 0 moving, -1 blocked/no path
    if (!n.path || n.pi >= n.path.length) { n.path = null; n.moving = false; return 1; }
    const c = n.path[n.pi], cx = (c % N) + n.jx, cz = ((c / N) | 0) + n.jz, dx = cx - n.x, dz = cz - n.z, l = Math.hypot(dx, dz);
    const cur = this.ci(n.x, n.z), wd = this.bridgeOK(cur) ? 0 : this.w[cur];
    // Recheck the next step while moving: hazards may have changed since A* ran.
    if (c !== cur && this.passCost(c, cur) < 0) { n.badGoal = this.ci(n.gx,n.gz); n.path = null; n.moving = false; return -1; }
    n.moveSpeed = (n.moveSpeed || 0) + (speed - (n.moveSpeed || 0)) * Math.min(1, dt * 7);
    speed = n.moveSpeed;
    if (wd > 0.2) speed *= 0.5; if (n.hp < 0.5) speed *= 0.6;
    if (l < 0.25 || l < speed * dt) { n.pi++; if (n.pi < n.path.length && this.passCost(n.path[n.pi], c) < 0) { n.path = null; n.moving = false; return -1; } return 0; }
    n.x += dx / l * speed * dt; n.z += dz / l * speed * dt; const turn = Math.atan2(dx,dz) - n.face; n.face += Math.atan2(Math.sin(turn),Math.cos(turn)) * Math.min(1,dt*10); n.moving = true; return 0;
  }
  drift(n, tx, tz, speed, dt) { const dx = tx - n.x, dz = tz - n.z, l = Math.hypot(dx, dz); if (l < 0.15) { n.moving = false; return true; } const nx = n.x + dx / l * speed * dt, nz = n.z + dz / l * speed * dt; if (this.passCost(this.ci(nx, nz), this.ci(n.x, n.z)) < 0) { n.moving = false; return true; } n.x = nx; n.z = nz; n.face = Math.atan2(dx, dz); n.moving = true; return false; }

  habitable(b) { if (!b || b.ruin || b.fire > 0 || b.wet > 0.3) return false; for (const p of b.parts) if (p.role === 'roof' && !p.st) return true; return false; }
  campFor(n) {
    let c = n.campRef; if (c) { const i = this.ci(c.x, c.z); if (c.dead || this.burn[i] > 0 || this.w[i] > 0.1) { c.dead = true; n.campRef = null; c = null; } }
    if (c) return c;
    let best = null, bd = 1e9; for (const k of this.camps) { if (k.dead || k === n.badCamp) continue; const d = Math.hypot(k.x - n.x, k.z - n.z); if (d < bd) { bd = d; best = k; } }
    if (!best || (n.badCamp && bd > 18)) best = n.badCamp ? this.newCamp(n.x, n.z, 2, 14) : this.newCamp(this.vc.x, this.vc.z, 14, 48);
    n.campRef = best; return best;
  }
  newCamp(cx, cz, rmin, rmax) {
    let best = -1e9, bx = -1, bz = 0; const rnd = this.rnd;
    for (let k = 0; k < 120; k++) {
      const a = rnd() * 6.28, r = rmin + rnd() * (rmax - rmin), x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r); if (x < 8 || z < 8 || x > N - 9 || z > ROWS - 9) continue;
      let ok = true, mn = 1e9, mx = -1e9;
      for (let dz = -3; dz <= 3 && ok; dz++) for (let dx = -3; dx <= 3; dx++) { const i = (z + dz) * N + x + dx; if (this.w[i] > 0.02 || this.burn[i] > 0 || this.bmap[i] || this.scorch[i] > 80 || this.kind[i] === K.FOREST || this.crack[i] > 20) { ok = false; break; } mn = Math.min(mn, this.h[i]); mx = Math.max(mx, this.h[i]); }
      if (!ok || mx - mn > 1.2) continue;
      let td = 0; for (const t of this.threats) td = Math.max(td, t.r + 8 - Math.hypot(t.x - x, t.z - z));
      if (td > 0) continue;
      const sc = -r * 0.25 + this.h[z * N + x] * 1.5 + rnd(); if (sc > best) { best = sc; bx = x; bz = z; }
    }
    if (bx < 0) return null;
    const c = { x: bx, z: bz, tents: 0, slot: 0, dead: false }; this.camps.push(c); this.fuel[bz * N + bx] = 0; this.fx.log('Survivors are making camp'); return c;
  }

  flyNPC(n, dt) {
    n.vy -= 18 * dt; n.vx *= 1 - dt * 0.35; n.vz *= 1 - dt * 0.35;
    n.x = clamp(n.x + n.vx * dt, 2, N - 3); n.z = clamp(n.z + n.vz * dt, 2, ROWS - 3); n.y += n.vy * dt;
    const gy = this.walkH(this.ci(n.x, n.z));
    if (n.y > gy) return;
    n.y = gy; n.air = 0; n.st = STUMBLE; n.t = 0.7 + this.rnd() * 0.8; n.path = null; n.moving = false; n.hp -= 0.1; n.cause = n.cause || 'hurled by the wind';
    this.fx.burst('dust', n.x, gy + 0.2, n.z, 4, 0.4, 0.5); this.fx.sound('thud', n.x, n.z, 0.35);
    if (n.hp <= 0) this.kill(n);
  }
  stepNPC(n, dt) {
    if (n.erased) return;
    n.fleeT = Math.max(0, (n.fleeT || 0) - dt);
    if (n.st === DEAD) { n.deadT += dt; return; }
    if (n.air > 0) { this.flyNPC(n, dt); return; }
    if (n.held) { n.held = 0; n.moving = false; return; }
    const rnd = this.rnd, ci = this.ci(n.x, n.z);
    if (!n.inside) {
      if (this.burn[ci] > 0.25) { n.hp -= dt * 0.4; n.onFire = 1.5; n.cause = 'burned'; if (n.st !== PANIC) this.panic(n, n.x, n.z, 6); }
      const wd = this.bridgeOK(ci) ? 0 : this.w[ci];
      if (wd > 0.7) { n.hp -= dt * 0.11; n.cause = 'drowned'; n.x = clamp(n.x + this.flx[ci] * 60 * dt * 3, 2, N - 3); n.z = clamp(n.z + this.flz[ci] * 60 * dt * 3, 2, ROWS - 3); if (n.st !== PANIC && n.st !== STUMBLE) this.panic(n, n.x, n.z, 6); }
      n.y = this.walkH(ci) + (wd > 0.7 ? wd - 0.5 : 0);
    }
    if (n.onFire > 0) n.onFire -= dt;
    if (n.hp <= 0) { this.kill(n); return; }
    n.senseT -= dt;
    if (n.senseT <= 0) { n.senseT = 0.3 + rnd() * 0.2; const dg = this.dangerAt(n); if (dg) { if (n.st === STUMBLE) { n.tx = dg.x; n.tz = dg.z; } else this.panic(n, dg.x, dg.z, dg.r); } else if (n.st === PANIC) n.calm += 0.4; }
    switch (n.st) {
      case STUMBLE: n.t -= dt; n.moving = false; if (n.t <= 0) { n.st = SHAKEN; this.panic(n, n.tx, n.tz, n.tr); } break;
      case PANIC: {
        const r = n.path ? this.move(n, 3.3, dt) : 1;
        if (r !== 0 && !n.queued) { if (n.calm > 2.5) { n.st = SHAKEN; n.t = 3 + rnd() * 5; n.moving = false; } else if (n.calm < 0.5) this.pickFlee(n); else n.moving = false; }
        else if (r !== 0) { const a = Math.atan2(n.z - n.tz, n.x - n.tx); this.drift(n, n.x + Math.cos(a) * 3, n.z + Math.sin(a) * 3, 3, dt); }
        break;
      }
      case SHAKEN: n.t -= dt; n.moving = false; if (n.t <= 0 && !this.dangerAt(n)) { n.st = ROUTINE; n.goal = ''; } break;
      default: this.routine(n, dt);
    }
  }
  routine(n, dt) {
    const rnd = this.rnd; if (n.hp < 1) n.hp = Math.min(1, n.hp + dt * 0.004);
    const hr = this.time * 24, home = this.buildings[n.home], ok = this.habitable(home);
    let goal, gx, gz;
    if (!ok) {
      n.homeless = true; const c = this.campFor(n); if (!c) { n.moving = false; return; }
      goal = 'camp'; gx = c.x; gz = c.z;
      if (Math.hypot(n.x - c.x, n.z - c.z) < 5) {
        n.campT += dt;
        if (n.campT > 6 + (n.id % 8)) {
          n.campT = 0; let hl = 0, cap = 0; for (const m of this.npcs) if (m.st !== DEAD && m.homeless) hl++;
          for (const b of this.buildings) if (b.type === 'tent' && !b.ruin) cap += 3;
          let tent = null; for (const b of this.buildings) if (b.type === 'tent' && this.habitable(b)) { let occ = 0; for (const m of this.npcs) if (m.home === b.id && m.st !== DEAD) occ++; if (occ < 3) { tent = b; break; } }
          if (!tent && c.tents < 40) { for (let k = 0; k < 10 && !tent; k++) { let s = c.slot++, ring = 0; while (s >= 5 + ring * 4) { s -= 5 + ring * 4; ring++; } const a = s / (5 + ring * 4) * 6.283 + ring * 0.4, r = 5 + ring * 4; tent = this.addB('tent', Math.round(c.x + Math.cos(a) * r), Math.round(c.z + Math.sin(a) * r), true, [-Math.cos(a), -Math.sin(a)], true); } if (tent) { c.tents++; tent.doorX = tent.x - Math.cos(Math.atan2(tent.z - c.z, tent.x - c.x)) * 1.6; tent.doorZ = tent.z - Math.sin(Math.atan2(tent.z - c.z, tent.x - c.x)) * 1.6; this.fx.log(n.name + ' raised a tent'); this.fx.sound('hammer', tent.x, tent.z, 0.6); } }
          if (tent) { n.home = tent.id; n.homeless = false; n.goal = ''; }
        }
      }
    } else {
      n.homeless = false;
      if (hr < 6 || hr >= 21) { goal = 'home'; gx = home.doorX; gz = home.doorZ; }
      else if ((hr >= 12 && hr < 13.5) || hr >= 18) { goal = 'plaza'; gx = (n.plaza || this.vc).x + 1 + (n.id % 7) - 3; gz = (n.plaza || this.vc).z + 1 + ((n.id * 3) % 7) - 3; if (home.type === 'tent') { gx = home.doorX + (n.id % 3) - 1; gz = home.doorZ + (n.id % 2); } }
      else { goal = 'work'; gx = n.wx; gz = n.wz; }
    }
    if (n.goal !== goal) { n.goal = goal; n.gx = gx; n.gz = gz; n.inside = false; n.working = false; n.arr = false; n.fail = 0; this.reqPath(n, gx, gz); return; }
    if (n.inside) return;
    if (n.path) { const r = this.move(n, n.child ? 2.1 : 1.55, dt); if (r === -1) { n.repT = 0.5; } return; }
    if (n.queued) return;
    const dist = Math.hypot(n.x - n.gx, n.z - n.gz);
    if (!n.arr && dist > 2.2 && n.fail < 4) { n.repT -= dt; n.moving = false; if (n.repT <= 0) { n.repT = 3 + rnd() * 4; n.fail++; this.reqPath(n, n.gx, n.gz); } return; }
    if (goal === 'camp' && n.fail >= 4 && dist > 6) { n.badCamp = n.campRef; n.campRef = null; n.goal = ''; n.fail = 0; return; }
    n.arr = true;
    if (goal === 'home') { if (dist < 2.5) { n.inside = true; n.moving = false; n.x = home.doorX; n.z = home.doorZ; } return; }
    n.idleT -= dt;
    if (n.idleT <= 0) { n.idleT = 2 + rnd() * 5; const a = rnd() * 6.28, r = goal === 'work' ? 2.5 : 3.5; n.ix = n.gx + Math.cos(a) * r * rnd(); n.iz = n.gz + Math.sin(a) * r * rnd(); n.wandering = true; }
    if (n.wandering) { if (this.drift(n, n.ix, n.iz, 0.9, dt)) { n.wandering = false; } n.working = false; }
    else { n.moving = false; n.working = goal === 'work'; }
  }

  // ------------------------------------------------------------ powers
  nearDam(x, z, r) { const xi = Math.round(x), zi = Math.round(z), R = Math.ceil(r); for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) { const X = xi + dx, Z = zi + dz; if (X < 0 || Z < 0 || X >= N || Z >= ROWS) continue; if (this.kind[Z * N + X] === K.DAM && this.h[Z * N + X] > this.h0[Z * N + X] - 1) return true; } return false; }
  breakDam(x, z, I) {
    const r = 2.5 + 3.5 * I, xi = Math.round(x), zi = Math.round(z), R = Math.ceil(r), rnd = this.rnd; let n = 0;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const X = xi + dx, Z = zi + dz; if (X < 1 || Z < 1 || X >= N - 1 || Z >= ROWS - 1) continue; const i = Z * N + X, d = Math.hypot(dx, dz); if (d > r || this.kind[i] !== K.DAM) continue;
      const tgt = this.bed(Z) - 0.8 + 3 * Math.pow(d / r, 3); if (this.h[i] > tgt) {
        if (n % 2 === 0) this.debris.push({ x: X, y: this.h[i], z: Z, vx: rnd() * 4 - 2, vy: 2 + rnd() * 4, vz: 3 + rnd() * 5, rx: 0, ry: rnd() * 6, rz: 0, wx: rnd() * 6 - 3, wy: 0, wz: rnd() * 6 - 3, sx: 0.5 + rnd() * 0.7, sy: 0.4 + rnd() * 0.5, sz: 0.5 + rnd() * 0.7, g: 0, c: [0.6, 0.6, 0.58], b: 0, from: -1, mass: 0.6, hot: 0 });
        this.h[i] = tgt; this.crack[i] = 200; n++;
      }
    }
    if (n) { this.terrDirty = true; this.fx.burst('dust', x, this.hAt(x, z) + 3, z, 30, 3, 1.5); this.fx.sound('dambreak', x, z, 1); this.fx.shake(0.5); this.checkDam(); }
    return n;
  }
  checkDam() { if (this.damBroken) return; for (let z = 57; z <= 59; z++) for (let x = 0; x < N; x++) { const i = z * N + x; if (this.kind[i] === K.DAM && this.h[i] < this.h0[i] - 1.6) { this.damBroken = true; this.fx.log('THE DAM IS BREACHED — the reservoir is emptying'); this.addThreat(this.rx(64), 64, 10, 20); return; } } }
  // Finite volume emission, shared by click and held Flood input.
  // Only sea cells (flag 2) exchange water with an external reservoir.
  // Springs, rain, crater seepage and meteor vaporisation are explicit sources/sinks.
  emitWater(x, z, I, dt) {
    if (![x, z, I, dt].every(Number.isFinite) || dt <= 0) return 0;
    const r = 1.2 + 1.3 * clamp(I, 0.1, 1), R = Math.ceil(r);
    const xi = Math.round(x), zi = Math.round(z), cells = [];
    let weight = 0;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const X = xi + dx, Z = zi + dz, d = Math.hypot(dx, dz);
      if (X < 2 || Z < 2 || X >= N - 2 || Z >= ROWS - 2 || d >= r) continue;
      const i = Z * N + X; if ((this.flag[i] & 2) && !this.inEstuary(i)) continue;
      const q = 1 - d / r; cells.push([i, q]); weight += q;
    }
    if (!weight) return 0;
    const volume = (60 + 240 * clamp(I, 0.1, 1)) * Math.min(dt, 0.1);
    for (const [i, q] of cells) this.w[i] += volume * q / weight;
    return volume;
  }

  carve(x, z, I, dt) { // Terrain channel helper retained for landscape interactions
    if (this.nearDam(x, z, 2 + I)) { this.breakDam(x, z, I); return; }
    const r = 1.2 + 1.3 * I, xi = Math.round(x), zi = Math.round(z), R = Math.ceil(r), lim = 1.5 + 2.5 * I; let ch = false;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const X = xi + dx, Z = zi + dz; if (X < 2 || Z < 2 || X >= N - 2 || Z >= ROWS - 2) continue; const i = Z * N + X, d = Math.hypot(dx, dz); if (d > r || (this.flag[i] & 2)) continue;
      const tgt = this.h0[i] - lim * (1 - (d / r) * (d / r)); if (this.h[i] > tgt) { this.h[i] = Math.max(tgt, this.h[i] - dt * 9); this.mud[i] = Math.max(this.mud[i], 170); this.fuel[i] = 0; if (this.tree[i] === 1) { this.tree[i] = 4; this.staticDirty = true; } ch = true; const bi = this.bmap[i]; if (bi) this.damage(this.buildings[bi - 1], dt * 2, 'quake', x, z); }
    }
    if (ch) { this.terrDirty = true; this.staticDirty = true; if (this.rnd() < 0.3) this.fx.burst('dust', x, this.hAt(x, z) + 0.3, z, 2, r, 0.6); }
  }

  quake(x0, z0, x1, z1, I) {
    let len = Math.hypot(x1 - x0, z1 - z0); if (len < 4) { const a = this.rnd() * 6.28; x1 = x0 + Math.cos(a) * 6; z1 = z0 + Math.sin(a) * 6; len = 6; }
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len, nx = -uz, nz = ux, n = Math.ceil(len / 1.3), pts = [], rnd = this.rnd;
    for (let k = 0; k <= n; k++) { const t = k / n, o = (k > 0 && k < n) ? (rnd() - 0.5) * 2.4 : 0; pts.push([x0 + (x1 - x0) * t + nx * o, z0 + (z1 - z0) * t + nz * o]); }
    const Rs = 5 + 7 * I, amp = 0.35 + 1.0 * I, ci = [], amt = [], tp = [];
    const X0 = Math.max(2, Math.floor(Math.min(x0, x1) - Rs)), X1 = Math.min(N - 3, Math.ceil(Math.max(x0, x1) + Rs)), Z0 = Math.max(2, Math.floor(Math.min(z0, z1) - Rs)), Z1 = Math.min(ROWS - 3, Math.ceil(Math.max(z0, z1) + Rs));
    for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) { const i = z * N + x; if (this.flag[i] & 2) continue; const px = x - x0, pz = z - z0, t = (px * ux + pz * uz) / len; if (t <= 0 || t >= 1) continue; const d = px * nx + pz * nz, ad = Math.abs(d); if (ad >= Rs) continue; const f = 1 - ad / Rs; ci.push(i); amt.push((d >= 0 ? 1 : -1) * amp * f * f * Math.sqrt(Math.sin(Math.PI * t))); tp.push(t); }
    const R = 12 + 20 * I, q = { pts, I, t: 0, dur: 5 + 5 * I, prog: 0, done: 0, R, ci, amt, tp, bl: [], x0, z0, x1, z1 };
    const segD = (x, z) => { const px = x - x0, pz = z - z0, t = clamp((px * ux + pz * uz) / len, 0, 1); return Math.hypot(px - ux * len * t, pz - uz * len * t); };
    if (segD(this.volcano.x,this.volcano.z)<R) this.wakeVolcano();
    for (const b of this.buildings) { const d = segD(b.x, b.z); if (d < R && !b.ruin) q.bl.push({ b, d }); }
    for (const m of this.npcs) { if (m.st === DEAD) continue; const d = segD(m.x, m.z); if (d < R) { const px = m.x - x0, pz = m.z - z0, t = clamp((px * ux + pz * uz) / len, 0, 1); if (m.inside) { m.inside = false; } m.st = STUMBLE; m.t = 0.6 + rnd() * 1.4; m.path = null; m.tx = x0 + ux * len * t; m.tz = z0 + uz * len * t; m.tr = R * 0.5; this.alarm = 22; } }
    for (let s = 0; s <= len; s += 6) this.addThreat(x0 + ux * s, z0 + uz * s, R * 0.55, q.dur + 2);
    this.quakes.push(q); this.fx.log('The earth splits open'); this.panicSound((x0 + x1) / 2, (z0 + z1) / 2, 0.8);
    return q;
  }
  crackSeg(ax, az, bx, bz, I) {
    const len = Math.hypot(bx - ax, bz - az), st = Math.max(1, Math.ceil(len / 0.5)), wd = 0.8 + 0.9 * I, R = Math.ceil(wd) + 2, rnd = this.rnd, depth = (1.2 + 3 * I) * (0.7 + 0.5 * rnd());
    for (let s = 0; s <= st; s++) {
      const x = ax + (bx - ax) * s / st, z = az + (bz - az) * s / st, xi = Math.round(x), zi = Math.round(z);
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const X = xi + dx, Z = zi + dz; if (X < 2 || Z < 2 || X > N - 3 || Z > ROWS - 3) continue; const i = Z * N + X; if (this.flag[i] & 2) continue; const d = Math.hypot(X - x, Z - z);
        if (d < wd) { this.meltCell(i,1,true); const nc = depth * (1 - (d / wd) * (d / wd)), oc = this.crack[i] / 255 * 5; if (nc > oc) { this.h[i] -= nc - oc; this.crack[i] = Math.min(255, nc / 5 * 255); this.fuel[i] = 0; if (this.tree[i]) this.tree[i] = 0; const bi = this.bmap[i]; if (bi) this.damage(this.buildings[bi - 1], 0.25, 'quake', x, z); } }
        else { if (d < wd + 1.15 && this.crack[i] < 18 && !(this.flag[i] & 2)) { this.h[i] += (0.08 + 0.14 * I) * (1 - (d - wd) / 1.15); this.crack[i] = Math.max(this.crack[i], 36); } if (d < wd + 2 && this.tree[i] === 1 && rnd() < 0.08 * I) this.tree[i] = 4; }
      }
    }
    this.fx.burst('dust', bx, this.hAt(bx, bz) + 0.5, bz, 10, 1.6, 1.15); this.fx.sound('crack', bx, bz, 0.5 + 0.4 * I);
    if (!this.damBroken) this.checkDam();
    this.terrDirty = true; this.staticDirty = true;
  }
  stepQuake(q, dt) {
    q.t += dt; const env = Math.sin(Math.PI * Math.min(1, q.t / q.dur)); this.fx.shake(q.I * env * 0.5);
    const pr = Math.min(1.3, q.t / (q.dur * 0.5)), prev = q.prog; q.prog = pr;
    const k1 = Math.floor(Math.min(1, pr) * (q.pts.length - 1));
    while (q.done < k1) { const a = q.pts[q.done], b = q.pts[q.done + 1]; this.crackSeg(a[0], a[1], b[0], b[1], q.I); q.done++; }
    if (pr > prev) { const h = this.h, ci = q.ci, amt = q.amt, tp = q.tp; for (let k = 0; k < ci.length; k++) { const f1 = clamp((pr - tp[k]) / 0.3, 0, 1), f0 = clamp((prev - tp[k]) / 0.3, 0, 1); if (f1 > f0) h[ci[k]] += amt[k] * (f1 - f0); } this.terrDirty = true; this.staticDirty = true; }
    for (const e of q.bl) { const f = 1 - e.d / q.R; e.b.shake = env * q.I * f; e.b.active = true; this.damage(e.b, dt * q.I * 0.6 * f * f * env, 'quake', e.b.x, e.b.z); }
    if (q.t >= q.dur) { for (const e of q.bl) e.b.shake = 0; return true; }
    return false;
  }

  meteor(x, z, I) { const m = { x, z, I, t: 0, T: 2.8, sx: x - 34, sy: this.hAt(x, z) + 70, sz: z - 24, px: 0, py: 0, pz: 0 }; this.meteors.push(m); this.addThreat(x, z, (4 + 7 * I) * 2.6, 4); this.fx.sound('whoosh', x, z, 1); this.fx.log('A star falls from the heavens'); return m; }
  impact(m) {
    const I = m.I, R = 4 + 7 * I, depth = 2.5 + 4 * I, xi = Math.round(m.x), zi = Math.round(m.z), RR = Math.ceil(R * 3.3), rnd = this.rnd, gy = this.hAt(m.x, m.z);
    let steam = false;
    for (let dz = -RR; dz <= RR; dz++) for (let dx = -RR; dx <= RR; dx++) {
      const X = xi + dx, Z = zi + dz; if (X < 2 || Z < 2 || X > N - 3 || Z > ROWS - 3) continue; const i = Z * N + X; if (this.flag[i] & 2) continue; const d = Math.hypot(X - m.x, Z - m.z), u = d / R;
      if(u<2.1)this.meltCell(i,1,true);
      if (u < 1.6) { let dh = 0; if (u < 1) { dh = -depth * Math.pow(1 - u * u, 1.3); if (this.w[i] > 0.05) steam = true; this.w[i] = 0; this.fuel[i] = 0; if (this.burn[i] > 0) this.burn[i] = 0.01; if (!(this.flag[i] & 1)) { this.flag[i] |= 1; this.craterCells.push(i); } } const e = (u - 1.05) / 0.2; dh += depth * 0.2 * Math.exp(-e * e); this.h[i] += dh; }
      if (u < 1.35) { this.scorch[i] = 255; this.tree[i] = 0; }
      else if (u < 2.3) { this.scorch[i] = Math.max(this.scorch[i], 150); if (this.tree[i] === 1 || this.tree[i] === 2) this.tree[i] = rnd() < 0.6 ? 4 : 3; if (rnd() < 0.3) this.igniteCell(i); }
      if (u > 0.75 && u < 2.15) this.crack[i] = Math.max(this.crack[i], (210 * (1 - (u - 0.75) / 1.4)) | 0);
      else if (u < 3.2) { if (rnd() < 0.22) this.igniteCell(i); }
    }
    this.fires = this.fires.filter(i => this.burn[i] > 0.02 || (this.burn[i] = 0, false));
    for (const b of this.buildings) {
      if (b.ruin) continue; const d = Math.hypot(b.x - m.x, b.z - m.z) - Math.max(b.w, b.d) * 0.4;
      if (d < R * 1.3) { for (const p of b.parts) if (!p.st && p.role !== 'base') this.failPart(b, p, 'blast', m.x, m.z, I); }
      else if (d < R * 2.4) { this.damage(b, 1.3 * (1 - (d - R * 1.3) / (R * 1.1)) + 0.15, 'blast', m.x, m.z, I); if (rnd() < 0.6) this.igniteB(b); }
      else if (d < R * 4) { const shock = 1 - (d - R * 2.4) / (R * 1.6); b.shake = Math.max(b.shake, shock * I); this.damage(b, 0.3 * shock * I, 'shock', m.x, m.z); }
    }
    for (const n of this.npcs) {
      if (n.st === DEAD) continue; const d = Math.hypot(n.x - m.x, n.z - m.z);
      if (d < R * 1.25) { n.cause = 'meteor'; n.inside = false; this.kill(n); n.deadT = 999; }
      else if (d < R * 2.2) { n.hp -= 0.5 + rnd() * 0.4; n.cause = 'meteor blast'; n.inside = false; n.st = STUMBLE; n.t = 1 + rnd(); n.tx = m.x; n.tz = m.z; n.tr = R * 2; n.path = null; this.alarm = 22; }
      else if (d < R * 3.5) this.panic(n, m.x, m.z, R * 2.5);
    }
    const ne = 10 + (18 * I) | 0;
    for (let k = 0; k < ne; k++) { const a = rnd() * 6.28, sp = 5 + rnd() * 12 * (0.5 + I), s = 0.3 + rnd() * 0.8; this.debris.push({ x: m.x + Math.cos(a) * R * 0.5, y: gy + 0.5, z: m.z + Math.sin(a) * R * 0.5, vx: Math.cos(a) * sp, vy: 8 + rnd() * 12, vz: Math.sin(a) * sp, rx: 0, ry: rnd() * 6, rz: 0, wx: rnd() * 8 - 4, wy: 0, wz: rnd() * 8 - 4, sx: s, sy: s * 0.8, sz: s, g: 0, c: [0.2, 0.17, 0.15], b: 0, from: -1, mass: s * 2, hot: 1 }); }
    for (let k = 0; k < 6; k++) { const a = rnd() * 6.28, sp = 3 + rnd() * 7, s = 0.7 + rnd() * 0.55; this.debris.push({ x: m.x + Math.cos(a) * R * 0.35, y: gy + 0.8, z: m.z + Math.sin(a) * R * 0.35, vx: Math.cos(a) * sp, vy: 6 + rnd() * 7, vz: Math.sin(a) * sp, rx: 0, ry: rnd() * 6, rz: 0, wx: rnd() * 5 - 2, wy: rnd() * 3, wz: rnd() * 5 - 2, sx: s, sy: s * 0.45, sz: s * 0.7, g: 0, c: [0.28, 0.2, 0.16], b: 0, from: -1, mass: s * 2.2, hot: k < 3 ? 1 : 0 }); }
    this.addRubble(m.x, gy - depth + 0.3, m.z, 0.9 + I, 0.8 + I * 0.6, 0.9 + I, 0.3, rnd() * 6, 0.2, 0, 0.16, 0.13, 0.12);
    this.emitters.push({ x: m.x, z: m.z, ttl: 25, r: R * 0.6, type: 'smoke' }); this.seepHold = 1500;
    this.addThreat(m.x, m.z, R * 2.5, 8);
    this.fx.flash(0.9); this.fx.shake(1 + I); this.fx.sound('boom', m.x, m.z, 1);
    this.fx.burst('fire', m.x, gy + 1, m.z, 60, R * 0.5, 2 + I * 2); this.fx.burst('smoke', m.x, gy + 2, m.z, 40, R * 0.7, 2); this.fx.burst('ring', m.x, gy + 0.5, m.z, 80, R, 1 + I); this.fx.burst('dust', m.x, gy + 1, m.z, 50, R, 2.5);
    if (steam) this.fx.burst('steam', m.x, gy + 1, m.z, 40, R * 0.6, 2);
    this.fx.log('Impact — a crater ' + Math.round(R * 2) + ' paces wide');
    if (!this.damBroken) this.checkDam();
    this.terrDirty = true; this.staticDirty = true;
  }

  fingerPress(x, z, I) {
    this.meltCell(this.ci(x,z),1,true);
    const R = 1.6 + 2.4 * I, depth = 0.5 + 1.1 * I, xi = Math.round(x), zi = Math.round(z), RR = Math.ceil(R * 1.5), rnd = this.rnd;
    for (let dz = -RR; dz <= RR; dz++) for (let dx = -RR; dx <= RR; dx++) {
      const X = xi + dx, Z = zi + dz; if (X < 2 || Z < 2 || X > N - 3 || Z > ROWS - 3) continue; const i = Z * N + X; if (this.flag[i] & 2) continue; const u = Math.hypot(X - x, Z - z) / R;
      if (u < 1) { if (this.h0[i] - this.h[i] < 7) this.h[i] -= depth * (1 - u * u); this.mud[i] = Math.max(this.mud[i], 140); this.fuel[i] *= 0.3; if (this.tree[i]) this.tree[i] = this.tree[i] === 3 ? 3 : 5; if (this.burn[i] > 0) this.fuel[i] = 0; }
      else if (u < 1.45) { const e = (u - 1.2) / 0.15; this.h[i] += depth * 0.18 * Math.exp(-e * e); }
    }
    for (const b of this.buildings) {
      if (b.ruin || Math.hypot(b.x - x, b.z - z) > R + Math.max(b.w, b.d)) continue; let any = false;
      for (const p of b.parts) { if (p.st || p.role === 'base') continue; const d = Math.hypot(b.x + p.ox - x, b.z + p.oz - z) - Math.max(p.sx, p.sz) * 0.35; if (d < R) { this.failPart(b, p, 'crush', x, z, I); any = true; } }
      if (!any) this.damage(b, 0.2, 'quake', x, z);
    }
    for (const n of this.npcs) { if (n.st === DEAD) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < R * 0.95 && !n.inside) { n.cause = 'crushed'; this.kill(n); n.flat = true; } else if (d < R * 3.5 + 5) this.panic(n, x, z, R * 2 + 5); }
    this.addThreat(x, z, R * 2 + 4, 3);
    const gy = this.hAt(x, z); this.fx.burst('dust', x, gy + 0.3, z, 24, R, 1.5); this.fx.burst('ring', x, gy + 0.3, z, 30, R * 0.8, 0.5); this.fx.shake(0.25 + 0.3 * I); this.fx.sound('thud', x, z, 1); this.fx.sound('crack', x, z, 0.5);
    if (!this.damBroken) this.checkDam();
    this.terrDirty = true; this.staticDirty = true;
  }

  ignite(x, z, I) {
    const R = 1.5 + 4 * I, xi = Math.round(x), zi = Math.round(z), RR = Math.ceil(R); let n = 0;
    for (let dz = -RR; dz <= RR; dz++) for (let dx = -RR; dx <= RR; dx++) { const X = xi + dx, Z = zi + dz; if (X < 1 || Z < 1 || X > N - 2 || Z > ROWS - 2) continue; if (Math.hypot(dx, dz) > R) continue; const i = Z * N + X; if (this.igniteCell(i)) n++; const bi = this.bmap[i]; if (bi) { const b = this.buildings[bi - 1]; if (!b.fire && b.fuel > 0 && !b.ruin) { this.igniteB(b); n++; } } }
    if (this.bridgeB && !this.bridgeB.ruin && Math.hypot(this.bridgeB.x - x, this.bridgeB.z - z) < R + 3) this.igniteB(this.bridgeB);
    this.fx.burst('fire', x, this.hAt(x, z) + 0.5, z, 20, R * 0.6, 1.5); if (n) this.fx.sound('ignite', x, z, 0.8);
    return n;
  }


  // ------------------------------------------------------------ lightning
  lightning(x, z, I) {
    const R = 5 + 9 * I, rnd = this.rnd, st = { x, z, I, R, t: 0, q: [] };
    st.q.push({ t: 0.5, x, z, p: 0.7 + 0.8 * I, main: true });
    const n = 4 + Math.round(9 * I);
    for (let k = 0; k < n; k++) { const a = rnd() * 6.283, r = R * Math.sqrt(rnd()); st.q.push({ t: 0.65 + rnd() * (0.8 + 1.4 * I), x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, p: 0.25 + 0.35 * I * rnd(), main: false }); }
    st.q.sort((a, b) => a.t - b.t);
    this.storms.push(st); this.addThreat(x, z, R * 1.6, 3.5);
    for (const m of this.npcs) if (m.st !== DEAD && !m.inside && Math.hypot(m.x - x, m.z - z) < R * 2.2) this.panic(m, x, z, R * 1.6);
    this.fx.sound('charge', x, z, 1); this.fx.log('The sky turns black above the valley');
    return st;
  }
  rodTarget(x, z) { // lightning seeks tall things: standing buildings, then trees
    let best = null, bs = 0;
    for (const b of this.buildings) { if (b.ruin || b.type === 'bridge') continue; const d = Math.hypot(b.x - x, b.z - z); if (d > 6) continue; const top = b.type === 'church' ? 9 : b.hgt + 1.5, sc = top - d * 0.6; if (sc > bs) { bs = sc; best = [b.x, b.z]; } }
    if (best && this.rnd() < 0.75) return best;
    const xi = Math.round(x), zi = Math.round(z);
    for (let r = 0; r <= 2; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const X = xi + dx, Z = zi + dz; if (X < 2 || Z < 2 || X > N - 3 || Z > ROWS - 3) continue; if (this.tree[Z * N + X] === 1) return [X, Z]; }
    return [x, z];
  }
  boltPath(x0, y0, z0, x1, y1, z1, w, n, segs) {
    const rnd = this.rnd, len = Math.hypot(x1 - x0, y1 - y0, z1 - z0), pts = [[x0, y0, z0]];
    for (let k = 1; k < n; k++) { const t = k / n, j = len * 0.07 * Math.sin(Math.PI * t) + 0.3; pts.push([x0 + (x1 - x0) * t + (rnd() - 0.5) * 2 * j, y0 + (y1 - y0) * t + (rnd() - 0.5) * j * 0.6, z0 + (z1 - z0) * t + (rnd() - 0.5) * 2 * j]); }
    pts.push([x1, y1, z1]);
    for (let k = 0; k < n; k++) { const a = pts[k], b = pts[k + 1]; segs.push([a[0], a[1], a[2], b[0], b[1], b[2], w]); }
    return pts;
  }
  makeBolt(tx, ty, tz, w, br) {
    const rnd = this.rnd, segs = [], top = Math.max(ty, this.hAt(tx, tz)) + 46 + rnd() * 8;
    const pts = this.boltPath(tx + (rnd() - 0.5) * 14, top, tz + (rnd() - 0.5) * 14, tx, ty, tz, w, 18, segs);
    for (let k = 0; k < br; k++) { const p = pts[3 + ((rnd() * (pts.length - 7)) | 0)], a = rnd() * 6.283, r = 4 + rnd() * 9; this.boltPath(p[0], p[1], p[2], p[0] + Math.cos(a) * r, p[1] - 5 - rnd() * 10, p[2] + Math.sin(a) * r, w * 0.4, 7, segs); }
    this.bolts.push({ segs, ttl: 0.5, T: 0.5, x: tx, y: ty, z: tz, main: br > 3 });
  }
  strike(x, z, P, main) {
    const rnd = this.rnd, R = 1.2 + 3.2 * P, xi = Math.round(x), zi = Math.round(z), RR = Math.ceil(R * 1.3);
    let ty = this.hAt(x, z); const bi = this.bmap[this.ci(x, z)];
    if (bi) { const b = this.buildings[bi - 1]; if (!b.ruin) ty = b.y + (b.type === 'church' ? 9 : b.hgt + 1.3); } else if (this.tree[this.ci(x, z)] === 1) ty += 2;
    this.makeBolt(x, ty, z, main ? 0.9 + 0.6 * P : 0.25 + 0.2 * P, main ? 8 : 2);
    let wet = false;
    for (let dz = -RR; dz <= RR; dz++) for (let dx = -RR; dx <= RR; dx++) {
      const X = xi + dx, Z = zi + dz; if (X < 2 || Z < 2 || X > N - 3 || Z > ROWS - 3) continue; const i = Z * N + X; if (this.flag[i] & 2) continue;
      const u = Math.hypot(X - x, Z - z) / R; if (u >= 1) continue;
      if (this.w[i] > 0.1) { wet = true; continue; }
      this.scorch[i] = Math.max(this.scorch[i], (255 * (1 - u * 0.6)) | 0);
      if (main && u < 0.55 && this.h0[i] - this.h[i] < 4) { this.h[i] -= (0.3 + 0.9 * P) * (1 - u / 0.55); this.crack[i] = Math.max(this.crack[i], 60); }
      if (this.tree[i] === 1 && u < 0.45 && rnd() < 0.5) this.tree[i] = 4;
      if (rnd() < (1 - u) * 0.85) this.igniteCell(i);
    }
    for (const b of this.buildings) {
      if (b.ruin) continue; const d = Math.hypot(b.x - x, b.z - z) - Math.max(b.w, b.d) * 0.4;
      if (d < R * 0.5) { this.damage(b, 0.5 + 1.2 * P, main ? 'blast' : 'shock', x, z, P * 0.5); this.igniteB(b); }
      else if (d < R) { this.damage(b, 0.45 * P, 'shock', x, z); if (rnd() < 0.6) this.igniteB(b); }
    }
    for (const n of this.npcs) {
      if (n.st === DEAD) continue; const d = Math.hypot(n.x - x, n.z - z);
      if (n.inside) { if (d < R * 0.4) { n.hp -= 0.3; n.cause = 'struck by lightning'; } continue; }
      if (d < R * 0.55) { n.cause = 'struck by lightning'; n.onFire = 1; this.kill(n); }
      else if (d < R * 1.3) { n.hp -= 0.35 + 0.3 * P; n.cause = 'struck by lightning'; n.st = STUMBLE; n.t = 0.8 + rnd(); n.tx = x; n.tz = z; n.tr = R * 3; n.path = null; this.alarm = 22; }
      else if (d < R * 6) this.panic(n, x, z, R * 3);
    }
    if (wet) { // the water carries the charge
      for (const n of this.npcs) { if (n.st === DEAD || n.inside) continue; const ci = this.ci(n.x, n.z), d = Math.hypot(n.x - x, n.z - z); if (d < R * 4 + 6 && this.w[ci] > 0.2 && !this.bridgeOK(ci)) { n.hp -= 0.55; n.cause = 'electrocuted'; this.panic(n, x, z, R * 3); } }
      this.fx.burst('steam', x, this.hAt(x, z) + this.w[this.ci(x, z)], z, main ? 30 : 10, R * 0.6, 1.5);
    }
    this.addThreat(x, z, R * 2.2, 3);
    this.boltFlash = Math.max(this.boltFlash, main ? 1 : 0.55);
    const gy = this.hAt(x, z);
    this.fx.flash(main ? 0.55 : 0.16); this.fx.shake(main ? 0.6 + 0.5 * P : 0.18);
    this.fx.sound('thunder', x, z, main ? 1 : 0.65); this.fx.sound('zap', x, z, 0.8);
    this.fx.burst('spark', x, ty, z, main ? 70 : 22, 0.4, main ? 1.6 : 1); this.fx.burst('dust', x, gy + 0.3, z, main ? 26 : 8, R * 0.5, 1);
    if (main) { this.fx.burst('ring', x, gy + 0.4, z, 60, R * 0.6, 0.8 + P * 0.5); this.fx.log('Lightning blasts down from the heavens'); }
    if (!this.damBroken) this.checkDam();
    this.terrDirty = true; this.staticDirty = true;
  }
  stepStorm(s, dt) {
    s.t += dt;
    while (s.q.length && s.q[0].t <= s.t) { const e = s.q.shift(); let tx = e.x, tz = e.z; if (!e.main) { const r = this.rodTarget(tx, tz); tx = r[0]; tz = r[1]; } this.strike(clamp(tx, 3, N - 4), clamp(tz, 3, ROWS - 4), e.p, e.main); }
    return s.q.length === 0 && s.t > 3;
  }

  // ------------------------------------------------------------ tornado
  spawnTornado(x, z, I) {
    I = clamp(I == null ? 0.6 : I, 0.1, 1);
    if (this.tornados.length >= 3) this.tornados.shift();
    const a = this.rnd() * 6.2832;
    const t = { x: clamp(x, 4, N - 5), z: clamp(z, 4, ROWS - 5), I, vx: Math.cos(a), vz: Math.sin(a), head: a, wander: this.rnd() * 6, spin: this.rnd() * 6, life: 16 + 12 * I, max: 16 + 12 * I, R: 3.2 + 5.5 * I, dustT: 0, sndT: 0, pickT: 0, shakeT: 0 };
    this.tornados.push(t);
    this.addThreat(t.x, t.z, t.R * 2.4, 3);
    this.fx.log('A tornado touches the ground');
    this.fx.sound('gust', t.x, t.z, 1);
    this.fx.shake(0.22 + 0.15 * I);
    return t;
  }
  _gust(deb, tx, tz, R, I, dt, lift) {
    const dx = deb.x - tx, dz = deb.z - tz, d = Math.hypot(dx, dz);
    if (d > R || d < 0.001) return false;
    const pull = 1 - d / R, ang = Math.atan2(dz, dx), inn = Math.cos(ang), inz = Math.sin(ang), txv = -inz, tzv = inn;
    const acc = (10 + 16 * I) * pull;
    deb.vx += (-inn * acc + txv * acc * 0.85) * dt;
    deb.vz += (-inz * acc + tzv * acc * 0.85) * dt;
    deb.vy += ((lift || 7) * pull * pull) * dt;
    if (d < R * 0.28) { deb.vx += inn * (8 + 10 * I); deb.vz += inz * (8 + 10 * I); deb.vy += 4 + 6 * I; }
    return true;
  }
  stepTornado(t, dt) {
    const rnd = this.rnd;
    t.wander += dt; t.spin += dt * (6.2 + 4.5 * t.I); t.life -= dt;
    const wob = Math.sin(t.wander * 1.31) * 0.85 + Math.sin(t.wander * 0.43 + 1.7) * 0.55;
    t.head += wob * dt * 0.85;
    let ax = Math.cos(t.head) * (2.1 + Math.sin(t.wander * 0.72));
    let az = Math.sin(t.head) * (2.1 + Math.cos(t.wander * 0.51));
    const s = this.steer;
    if (s) {
      const dx = s.x - t.x, dz = s.z - t.z, l = Math.hypot(dx, dz) || 1, inf = s.strong ? 10 : 5.2;
      ax += dx / l * inf; az += dz / l * inf;
      if (l < 2.2) { ax *= 0.35; az *= 0.35; }
    }
    t.vx += (ax - t.vx) * Math.min(1, dt * 1.35);
    t.vz += (az - t.vz) * Math.min(1, dt * 1.35);
    const sp = (2.4 + 3.1 * (0.5 + 0.5 * Math.sin(t.wander * 0.63))) * (0.72 + 0.4 * t.I);
    const vl = Math.hypot(t.vx, t.vz) || 1;
    t.x = clamp(t.x + (t.vx / vl) * sp * dt, 3, N - 4);
    t.z = clamp(t.z + (t.vz / vl) * sp * dt, 3, ROWS - 4);
    const PR = t.R * 2.55, core = t.R * 0.42;
    const mi = this.ci(t.x, t.z);
    if (this.mud[mi] < 110) { this.mud[mi] = Math.min(180, this.mud[mi] + 50); this.terrDirty = true; }
    for (const b of this.buildings) {
      if (!b || b.gone || b.ruin) continue;
      let d = Math.hypot(b.x - t.x, b.z - t.z) - Math.max(b.w, b.d) * 0.35; if (d < 0) d = 0;
      if (d > t.R * 1.3) continue;
      const wind = clamp(1 - d / (t.R * 1.3), 0, 1);
      b.shake = Math.max(b.shake || 0, wind * (0.35 + 0.8 * t.I));
      b.active = true;
      this.damage(b, dt * (0.5 + 1.15 * t.I) * wind * wind, 'wind', t.x, t.z, wind);
    }
    t.upT = (t.upT || 0) - dt;
    if (t.upT <= 0) {
      t.upT = 0.11;
      const RR = Math.ceil(t.R), xi = t.x | 0, zi = t.z | 0;
      let pick = -1, best = -1;
      for (let n = 0; n < 18; n++) {
        const X = xi + ((rnd() * (RR * 2 + 1) - RR) | 0), Z = zi + ((rnd() * (RR * 2 + 1) - RR) | 0);
        if (X < 2 || Z < 2 || X >= N - 2 || Z >= ROWS - 2) continue;
        const d = Math.hypot(X - t.x, Z - t.z); if (d > t.R * 0.98) continue;
        const i = Z * N + X, tr = this.tree[i]; if (!tr || tr === 5) continue;
        const sc = (d < core ? 2.4 : 1) * rnd();
        if (sc > best) { best = sc; pick = i; }
      }
      if (pick >= 0) {
        const i = pick, tr = this.tree[i], X = i % N, Z = (i / N) | 0, ang = Math.atan2(Z - t.z, X - t.x);
        this.debris.push({ x: X, y: this.h[i] + 1.1, z: Z, vx: Math.cos(ang) * (2 + rnd() * 5) - Math.sin(ang) * 3, vy: 4 + rnd() * 7, vz: Math.sin(ang) * (2 + rnd() * 5) + Math.cos(ang) * 3, rx: rnd(), ry: rnd() * 6, rz: rnd(), wx: rnd() * 5 - 2, wy: rnd() * 3, wz: rnd() * 5 - 2, sx: 0.22, sy: 1.5, sz: 0.22, g: 0, c: tr === 3 ? [0.12, 0.1, 0.09] : [0.34, 0.24, 0.16], b: 0, from: -1, mass: 0.35, hot: tr === 2 ? 1 : 0 });
        if (this.burn[i] > 0) { this.burn[i] = 0; const F = this.fires; for (let k = F.length - 1; k >= 0; k--) if (F[k] === i) { F[k] = F[F.length - 1]; F.pop(); } this.terrDirty = true; }
        this.tree[i] = 0; this.fuel[i] = Math.min(this.fuel[i], 0.08); this.staticDirty = true;
      }
    }
    t.pickT -= dt;
    if (t.pickT <= 0) {
      t.pickT = 0.16; const Rb = this.rubble; let n = 0;
      for (let k = Rb.length - 1; k >= 0 && n < 3; k--) {
        const r = Rb[k], dx = r[0] - t.x, dz = r[2] - t.z; if (dx * dx + dz * dz > (t.R * 0.9) * (t.R * 0.9)) continue;
        this.debris.push({ x: r[0], y: r[1] + 0.2, z: r[2], vx: -dx * 0.7 + dz * 0.4, vy: 4 + rnd() * 5, vz: -dz * 0.7 - dx * 0.4, rx: r[6], ry: r[7], rz: r[8], wx: rnd() * 5, wy: 1, wz: rnd() * 5, sx: r[3], sy: r[4], sz: r[5], g: r[9] || 0, c: [r[10], r[11], r[12]], b: 0, from: -1, mass: Math.min(1.2, r[3] * r[4] * r[5] * 2), hot: 0 });
        Rb[k] = Rb[Rb.length - 1]; Rb.pop(); n++; this.staticDirty = true;
      }
    }
    for (const d of this.debris) if (d.mass < 4) this._gust(d, t.x, t.z, PR, t.I, dt, 9 + 6 * t.I);
    for (const n of this.npcs) {
      if (n.erased || n.st === DEAD) continue;
      if (n.inside) { const hb = this.buildings[n.home]; if (!hb || Math.hypot(hb.x - t.x, hb.z - t.z) > t.R * 1.45) continue; this.panic(n, t.x, t.z, t.R); }
      const dx = n.x - t.x, dz = n.z - t.z, d = Math.hypot(dx, dz);
      if (d > PR || d < 0.05) continue;
      const pull = 1 - d / PR, ang = Math.atan2(dz, dx);
      n.cause = 'tornado';
      if (n.st !== PANIC && n.st !== STUMBLE && !(n.air > 0)) this.panic(n, t.x, t.z, t.R * 1.2);
      if (n.air > 0) { this._gust(n, t.x, t.z, PR, t.I, dt, 11); continue; }
      const inn = (5 + 12 * t.I) * pull * pull, sw = (3.5 + 7 * t.I) * pull;
      n.x += (-Math.cos(ang) * inn + Math.cos(ang + 1.5708) * sw) * dt;
      n.z += (-Math.sin(ang) * inn + Math.sin(ang + 1.5708) * sw) * dt;
      n.x = clamp(n.x, 2, N - 3); n.z = clamp(n.z, 2, ROWS - 3);
      n.y = this.walkH(this.ci(n.x, n.z)) + pull * (1.2 + 2.2 * t.I);
      n.face = ang + 1.2; n.held = 1; n.path = null;
      if (d < core || (d < t.R * 0.7 && rnd() < dt * 1.4)) {
        n.air = 1; n.held = 0;
        n.vx = Math.cos(ang) * (7 + 9 * rnd() * t.I) - Math.sin(ang) * 4;
        n.vz = Math.sin(ang) * (7 + 9 * rnd() * t.I) + Math.cos(ang) * 4;
        n.vy = 7 + 8 * rnd();
        n.hp -= 0.1 + 0.18 * t.I;
        n.inside = false;
        this.panicSound(n.x, n.z, 0.55);
        if (n.hp <= 0) { n.air = 0; this.kill(n); }
      }
    }
    t.sndT -= dt; if (t.sndT <= 0) { t.sndT = 0.45; this.fx.sound('gust', t.x, t.z, 0.35 + 0.4 * t.I); }
    t.shakeT -= dt; if (t.shakeT <= 0) { t.shakeT = 0.55; this.fx.shake(0.06 + 0.08 * t.I); }
    if (t.life <= 0) { this.fx.log('The wind dies down'); return true; }
    return false;
  }

  // ------------------------------------------------------------ main tick
  tick(dt) {
    this.tickN++; this.clock += dt; this.stepVolcano(dt); this.stepCold(dt);
    this.time += dt / DAYLEN; if (this.time >= 1) { this.time -= 1; this.day++; }
    this.windA += (Math.sin(this.clock * 0.05) * 0.3 + Math.sin(this.clock * 0.013 + 2) * 0.5) * dt * 0.05; this.windS = 0.6 + 0.35 * Math.sin(this.clock * 0.021 + 1);
    this.wind[0] = Math.cos(this.windA) * this.windS; this.wind[1] = Math.sin(this.windA) * this.windS;
    this.rainT -= dt; if (this.rainT <= 0) { if (this.rain > 0) { this.rain = 0; this.rainT = 220 + this.rnd() * 240; } else { this.rain = 1; this.rainT = 28 + this.rnd() * 20; this.fx.log('Rain sweeps over the valley'); } }
    if (this.alarm > 0) this.alarm -= dt; if (this.screamT > 0) this.screamT -= dt;
    for (const b of this.buildings) if (b.shake > 0) b.shake = Math.max(0, b.shake - dt * 2);
    this.stepWater();
    if (this.tickN % 15 === 1) this.rebuildHazards();
    if (this.tickN % 6 === 0) this.stepFire(dt * 6);
    for (let k = this.quakes.length - 1; k >= 0; k--) if (this.stepQuake(this.quakes[k], dt)) this.quakes.splice(k, 1);
    for (let k = this.tornados.length - 1; k >= 0; k--) if (this.stepTornado(this.tornados[k], dt)) this.tornados.splice(k, 1);
    for (let k = this.meteors.length - 1; k >= 0; k--) { const m = this.meteors[k]; m.t += dt; const u = Math.min(1, m.t / m.T), e = u * u; const gy = this.hAt(m.x, m.z); m.px = m.sx + (m.x - m.sx) * e; m.py = m.sy + (gy - m.sy) * e; m.pz = m.sz + (m.z - m.sz) * e; if (u >= 1) { this.impact(m); this.meteors.splice(k, 1); } }
    for (let k = this.storms.length - 1; k >= 0; k--) if (this.stepStorm(this.storms[k], dt)) this.storms.splice(k, 1);
    for (let k = this.bolts.length - 1; k >= 0; k--) { this.bolts[k].ttl -= dt; if (this.bolts[k].ttl <= 0) this.bolts.splice(k, 1); }
    if (this.boltFlash > 0) this.boltFlash = Math.max(0, this.boltFlash - dt * 3);
    for (let k = this.emitters.length - 1; k >= 0; k--) { this.emitters[k].ttl -= dt; if (this.emitters[k].ttl <= 0) this.emitters.splice(k, 1); }
    if (this.tickN % 30 === 0) for (const b of this.buildings) {
      if (b.ruin) continue; let dp = 0;
      if (b.type === 'bridge') { const i = this.ci(b.x, b.z); dp = this.h[i] + this.w[i] - (b.y - 0.5); }
      else for (const i of b.cells) { const v = this.h[i] + this.w[i] - b.y; if (this.w[i] > 0.05 && v > dp) dp = v; }
      b.wet = dp; if (dp > 0.18) { b.active = true; if (!b.logW && dp > 0.5) { b.logW = true; this.fx.log(this.bname(b) + ' is flooding'); } }
    }
    for (const b of this.buildings) if (b.active) this.tickB(b, dt);
    if (this.debris.length) this.stepDebris(dt);
    for (let k = this.threats.length - 1; k >= 0; k--) { this.threats[k].ttl -= dt; if (this.threats[k].ttl <= 0) this.threats.splice(k, 1); }
    for (let k = 0; k < 6 && this.pathQ.length; k++) { const n = this.pathQ.shift(); n.queued = false; if (n.st === DEAD) continue; n.path = this.findPath(this.ci(n.x, n.z), this.ci(n.px, n.pz)); n.pi = 0; if (!n.path.length) n.path = null; }
    for (const n of this.npcs) this.stepNPC(n, dt);
  }

  stats() { let alive = 0, inj = 0, dead = 0, hl = 0, pan = 0; for (const n of this.npcs) { if (n.erased) continue; if (n.st === DEAD) dead++; else { alive++; if (n.hp < 0.5) inj++; if (n.homeless) hl++; if (n.st === PANIC || n.st === STUMBLE) pan++; } } let bs = 0, bt = 0, tents = 0; for (const b of this.buildings) { if (b.gone || b.type === 'bridge') continue; if (b.type === 'tent') { if (!b.ruin) tents++; continue; } bt++; if (!b.ruin) bs++; } return { alive, inj, dead, hl, pan, bs, bt, tents, fires: this.fires.length }; }

  // ------------------------------------------------------------ save / load
  serialize() {
    const q16 = (a, s) => { const o = new Int16Array(NN); for (let i = 0; i < NN; i++) o[i] = clamp(Math.round(a[i] * s), -32768, 32767); return b64enc(new Uint8Array(o.buffer)); };
    const q8 = a => { const o = new Uint8Array(NN); for (let i = 0; i < NN; i++) o[i] = clamp(Math.round(a[i] * 255), 0, 255); return b64enc(o); };
    const r2 = v => Math.round(v * 100) / 100;
    return {
      v: 4, rows: ROWS, snow:b64enc(this.snow), ice32:b64enc(new Uint8Array(this.ice.buffer)), thaw32:b64enc(new Uint8Array(this.thaw.buffer)), blizzard:{...this.blizzard}, coldStep:this.coldStep, coldBand:this.coldBand, volcano: {...this.volcano}, lava: [...this.lava], basalt: b64enc(this.basalt), seed: this.seed, time: this.time, day: this.day, clock: this.clock, windA: this.windA, damBroken: this.damBroken, camps: this.camps.filter(c => !c.dead),
      h: q16(this.h, 100), w32: b64enc(new Uint8Array(this.w.buffer)), fuel: q8(this.fuel), burn: q8(this.burn), scorch: b64enc(this.scorch), crack: b64enc(this.crack), mud: b64enc(this.mud), tree: b64enc(this.tree), flag: b64enc(this.flag),
      B: this.buildings.map(b => ({ t: b.type, x: b.x, z: b.z, y: r2(b.y), f: r2(b.fire), fu: r2(b.fuel), r: (b.ruin || b.gone) ? 1 : 0, g: b.gone ? 1 : 0, dx: r2(b.doorX), dz: r2(b.doorZ), p: b.parts.map(p => [p.st, Math.round(p.hp * 100), Math.round(p.char * 100), Math.round(p.lean * 100)]) })),
      R: this.rubble.map(r => r.map(r2)),
      P: this.npcs.map(n => [r2(n.x), r2(n.z), r2(n.hp), n.erased ? DEAD : n.st, n.home, n.inside ? 1 : 0, n.homeless ? 1 : 0, n.flat ? 1 : 0, n.erased ? 999 : (n.st === DEAD ? Math.min(999, Math.round(n.deadT)) : 0), n.erased ? 1 : 0]),
      survival: this.npcs.map(n => ({calm:n.calm, t:n.t, tx:n.tx, tz:n.tz, tr:n.tr, onFire:n.onFire, cause:n.cause, air:n.air||0, vx:n.vx||0, vy:n.vy||0, vz:n.vz||0})),
      tickN: this.tickN, rain: this.rain, rainT: this.rainT, storms: this.storms, debris: this.debris,
      threats: this.threats, tornados: this.tornados, meteors: this.meteors,
      quakes: this.quakes.map(q => ({...q, bl:q.bl.map(e => ({id:e.b.id,d:e.d}))})),
      wg: this.well && this.well.gone ? 1 : 0
    };
  }
  static load(s) {
    const w = new World(s.seed);
    const extent = b64dec(s.tree).length;
    if (extent !== N*N && extent !== 320*N && extent !== NN) throw new Error('Unsupported saved world dimensions');
    const d16 = (str,a,scale) => {
      const data = new Int16Array(b64dec(str).buffer);
      if (data.length !== extent) throw new Error('Incomplete saved grid');
      for (let i=0;i<extent;i++) a[i]=data[i]/scale;
    };
    const d8 = (str,a) => {
      const data=b64dec(str);
      if (data.length !== extent) throw new Error('Incomplete saved grid');
      for (let i=0;i<extent;i++) a[i]=data[i]/255;
    };
    if (extent < NN) {
      // New permanent buildings precede shelters. Shift only legacy shelter IDs.
      const base=extent===N*N?w.frontierBuildingStart:w.arcticBuildingStart, extra=w.genCount-base;
      const id = old => old>=base ? old+extra : old;
      const buildings=new Array(s.B.length+extra);
      s.B.forEach((building,k)=>{ buildings[id(k)]=building; });
      s={...s,B:buildings,P:s.P.map(entry=>{ const row=entry.slice(); row[4]=id(row[4]); return row; }),
        quakes:(s.quakes||[]).map(q=>({...q,bl:q.bl.map(e=>({...e,id:id(e.id)}))}))};
    }
    if(s.snow)w.snow.set(b64dec(s.snow));
    if(s.ice32)w.ice.set(new Float32Array(b64dec(s.ice32).buffer));
    if(s.thaw32)w.thaw.set(new Float32Array(b64dec(s.thaw32).buffer));
    if(s.blizzard)Object.assign(w.blizzard,s.blizzard);
    w.coldStep=s.coldStep||0;w.coldBand=s.coldBand||0;
    if (s.volcano) Object.assign(w.volcano,s.volcano);
    if (s.lava) w.lava=new Map(s.lava);
    if (s.basalt) w.basalt.set(b64dec(s.basalt));
    for (let k = w.genCount; k < s.B.length; k++) { const e = s.B[k]; if (e.t === 'tent') { const sv = w.w; w.w = new Float32Array(NN); const b = w.addB('tent', e.x, e.z, true, [1, 0], true); w.w = sv; if (!b) { const dummy = { id: w.buildings.length, type: 'tent', x: e.x, z: e.z, y: e.y, w: 1, d: 1, hgt: 1, parts: [], ruin: true, cells: [], fire: 0, fuel: 0, tough: 1, flam: 1, doorX: e.x, doorZ: e.z }; w.buildings.push(dummy); } } }
    d16(s.h, w.h, 100); if (s.w32) w.w.set(new Float32Array(b64dec(s.w32).buffer)); else d16(s.w, w.w, 1000); d8(s.fuel, w.fuel); d8(s.burn, w.burn);
    w.scorch.set(b64dec(s.scorch)); w.crack.set(b64dec(s.crack)); w.mud.set(b64dec(s.mud)); w.tree.set(b64dec(s.tree)); w.flag.set(b64dec(s.flag));
    w.wb.set(w.w); w.fires = []; w.craterCells = [];
    for (let i = 0; i < NN; i++) { if (w.burn[i] > 0) w.fires.push(i); if (w.flag[i] & 1) w.craterCells.push(i); }
    s.B.forEach((e, k) => { const b = w.buildings[k]; if (!b) return; b.y = e.y; b.fire = e.f; b.fuel = e.fu; b.ruin = !!e.r; b.gone = !!e.g; b.doorX = e.dx; b.doorZ = e.dz; b.logged = b.logF = b.logW = true; e.p.forEach((q, j) => { const p = b.parts[j]; if (!p) return; p.st = q[0]; p.hp = q[1] / 100; p.char = q[2] / 100; p.lean = q[3] / 100; }); if (b.gone) { b.ruin = true; b.fire = 0; b.active = false; for (const i of b.cells) if (w.bmap[i] === b.id + 1) w.bmap[i] = 0; for (const p of b.parts) p.st = 1; } else b.active = !b.ruin; });
    w.rubble = s.R.map(r => r.slice());
    s.P.forEach((e, k) => { const n = w.npcs[k]; if (!n) return; n.x = e[0]; n.z = e[1]; n.hp = e[2]; n.st = s.v >= 2 && [ROUTINE,PANIC,STUMBLE,SHAKEN,DEAD].includes(e[3]) ? e[3] : (e[3] === DEAD ? DEAD : ROUTINE); n.home = e[4]; n.inside = !!e[5]; n.homeless = !!e[6]; n.flat = !!e[7]; n.deadT = e[8]; n.erased = !!e[9]; if (n.erased) { n.st = DEAD; n.hp = 0; n.inside = false; n.deadT = 999; } n.goal = ''; n.path = null; n.y = w.walkH(w.ci(n.x, n.z)); });
    w.time = s.time; w.day = s.day; w.clock = s.clock; w.windA = s.windA; w.damBroken = s.damBroken; w.camps = s.camps || []; if (s.wg && w.well) w.well.gone = true;
    if (s.survival) s.survival.forEach((e,k) => {
      const n=w.npcs[k]; if (!n || n.erased || n.st===DEAD) return;
      Object.assign(n,e); if (n.st===PANIC) w.reqPath(n,n.x+(n.x-n.tx),n.z+(n.z-n.tz));
    });
    w.tickN=s.tickN || 0; w.rain=s.rain || 0; w.rainT=s.rainT ?? w.rainT;
    w.storms=s.storms || []; w.debris=s.debris || [];
    w.threats=s.threats||[]; w.tornados=s.tornados||[]; w.meteors=s.meteors||[];
    w.quakes=(s.quakes||[]).map(q => ({...q,bl:q.bl.map(e=>({b:w.buildings[e.id],d:e.d})).filter(e=>e.b)}));
    w.rebuildHazards();
    w.terrDirty = true; w.staticDirty = true; return w;
  }
}

if (typeof module !== 'undefined') module.exports = { World, N, ROWS, NN, K, ROUTINE, PANIC, STUMBLE, SHAKEN, DEAD, DAYLEN };
