'use strict';
// ===================== GOD SIM — WebGL2 renderer + particles =====================
const M4 = {
  persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
  look(e, c, u) { let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l; let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l; const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx; return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]); },
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
};

const COMMON = `
uniform vec3 uSun,uSunC,uAmb,uFog,uCam; uniform float uFogD; uniform vec4 uLights[6];
vec3 shade(vec3 base, vec3 n, vec3 wp){
  float d=max(dot(n,uSun),0.0);
  vec3 c=base*(uAmb*(0.75+0.25*n.y)+uSunC*d);
  for(int i=0;i<6;i++){ vec3 L=uLights[i].xyz-wp; float dd=dot(L,L); float a=uLights[i].w/(1.0+dd*0.035); c+=base*vec3(1.0,0.48,0.14)*a*max(dot(n,normalize(L)),0.25); }
  return c; }
vec3 fog(vec3 c, vec3 wp){ float fd=distance(wp,uCam); return mix(c,uFog,1.0-exp(-fd*fd*uFogD)); }
`;
const TERR_VS = `#version 300 es
in vec3 aPos; in vec3 aCol; in float aGlow; uniform mat4 uVP; out vec3 vCol; out vec3 vW; out float vGlow;
void main(){ vW=aPos; vCol=aCol; vGlow=aGlow; gl_Position=uVP*vec4(aPos,1.0); }`;
const TERR_FS = `#version 300 es
precision highp float; in vec3 vCol; in vec3 vW; in float vGlow; out vec4 o;
uniform vec4 uMark,uMarkC,uShadow; uniform float uTime;` + COMMON + `
void main(){ vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); if(n.y<0.0) n=-n;
  vec3 c=shade(vCol,n,vW);
  float fl=0.75+0.25*sin(uTime*13.0+vW.x*3.1+vW.z*2.3);
  c+=vec3(1.0,0.42,0.06)*vGlow*fl*0.9;
  float sd=distance(vW.xz,uShadow.xy); c*=1.0-uShadow.w*smoothstep(uShadow.z,uShadow.z*0.45,sd);
  float md=distance(vW.xz,uMark.xy); float ring=smoothstep(0.22,0.0,abs(md-uMark.z));
  c=mix(c,uMarkC.rgb,clamp(ring+(md<uMark.z?0.13:0.0),0.0,1.0)*uMarkC.a);
  o=vec4(fog(c,vW),1.0); }`;
const WAT_VS = `#version 300 es
in vec3 aPos; in vec2 aDF; uniform mat4 uVP; out vec3 vW; out vec2 vDF;
void main(){ vW=aPos; vDF=aDF; gl_Position=uVP*vec4(aPos,1.0); }`;
const WAT_FS = `#version 300 es
precision highp float; in vec3 vW; in vec2 vDF; out vec4 o; uniform float uTime;` + COMMON + `
void main(){ float d=vDF.x; if(d<0.012) discard;
  vec2 p=vW.xz; float t=uTime;
  vec3 n=normalize(vec3(0.07*sin(p.x*2.1+t*1.7)+0.05*sin(p.y*3.3-t*2.3)+0.03*sin((p.x+p.y)*5.0+t*3.0),1.0,0.07*cos(p.y*2.4+t*1.3)+0.05*sin(p.x*3.7+t*2.1)));
  vec3 base=mix(vec3(0.30,0.58,0.62),vec3(0.07,0.22,0.40),smoothstep(0.0,2.2,d));
  base=mix(base,vec3(0.36,0.30,0.20),clamp(vDF.y*9.0,0.0,0.55));
  vec3 c=base*(uAmb*1.1+uSunC*(0.35+0.5*max(dot(n,uSun),0.0)));
  vec3 v=normalize(uCam-vW); vec3 h=normalize(v+uSun); c+=uSunC*pow(max(dot(n,h),0.0),70.0)*0.9;
  float foam=smoothstep(0.012,0.05,vDF.y)*(0.55+0.45*sin(p.x*7.0+p.y*5.0+t*9.0));
  c=mix(c,vec3(0.92,0.95,0.97)*(uAmb+uSunC*0.7),clamp(foam,0.0,0.75));
  for(int i=0;i<6;i++){ vec3 L=uLights[i].xyz-vW; float dd=dot(L,L); c+=vec3(1.0,0.45,0.12)*uLights[i].w/(1.0+dd*0.03)*0.5; }
  float a=smoothstep(0.012,0.22,d)*0.86+clamp(foam,0.0,0.3);
  o=vec4(fog(c,vW),clamp(a,0.0,0.96)); }`;
const INS_VS = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec3 iPos; in vec3 iScl; in vec3 iRot; in vec4 iCol; uniform mat4 uVP;
out vec3 vN; out vec3 vW; out vec4 vC;
mat3 rot(vec3 r){ float cx=cos(r.x),sx=sin(r.x),cy=cos(r.y),sy=sin(r.y),cz=cos(r.z),sz=sin(r.z);
  mat3 X=mat3(1,0,0, 0,cx,sx, 0,-sx,cx); mat3 Y=mat3(cy,0,-sy, 0,1,0, sy,0,cy); mat3 Z=mat3(cz,sz,0, -sz,cz,0, 0,0,1); return Y*X*Z; }
void main(){ mat3 R=rot(iRot); vec3 p=R*(aPos*iScl)+iPos; vN=R*normalize(aNor/max(iScl,vec3(0.001))); vW=p; vC=iCol; gl_Position=uVP*vec4(p,1.0); }`;
const INS_FS = `#version 300 es
precision highp float; in vec3 vN; in vec3 vW; in vec4 vC; out vec4 o;` + COMMON + `
void main(){ vec3 n=normalize(vN); vec3 c=shade(vC.rgb,n,vW); c=mix(c,vC.rgb*1.5,clamp(vC.a,0.0,1.0)); o=vec4(fog(c,vW),1.0); }`;
const PAR_VS = `#version 300 es
in vec4 aPS; in vec4 aCol; uniform mat4 uVP; uniform float uPx; out vec4 vC;
void main(){ gl_Position=uVP*vec4(aPS.xyz,1.0); gl_PointSize=clamp(aPS.w*uPx/gl_Position.w,1.0,400.0); vC=aCol; }`;
const PAR_FS = `#version 300 es
precision highp float; in vec4 vC; out vec4 o;
void main(){ float r=length(gl_PointCoord-0.5)*2.0; float a=vC.a*smoothstep(1.0,0.25,r); if(a<0.004) discard; o=vec4(vC.rgb,a); }`;

function geoBox() { const p = [], n = []; const F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; for (const f of F) { const u = [f[1], f[2], f[0]], v = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]]; const q = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]; for (const [a, b] of q) { p.push((f[0] + u[0] * a + v[0] * b) * 0.5, (f[1] + u[1] * a + v[1] * b) * 0.5, (f[2] + u[2] * a + v[2] * b) * 0.5); n.push(f[0], f[1], f[2]); } } return { p, n }; }
function triGeo(tris) { const p = [], n = []; for (const t of tris) { const [a, b, c] = t; const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; for (const q of t) { p.push(q[0], q[1], q[2]); n.push(nx, ny, nz); } } return { p, n }; }
function geoPyr() { const a = [-.5, -.5, -.5], b = [.5, -.5, -.5], c = [.5, -.5, .5], d = [-.5, -.5, .5], t = [0, .5, 0]; return triGeo([[a, t, b], [b, t, c], [c, t, d], [d, t, a], [a, b, c], [a, c, d]]); }
function geoPrism() { const a = [-.5, -.5, -.5], b = [.5, -.5, -.5], c = [.5, -.5, .5], d = [-.5, -.5, .5], r0 = [0, .5, -.5], r1 = [0, .5, .5]; return triGeo([[a, r0, b], [d, c, r1], [b, r0, r1], [b, r1, c], [a, d, r1], [a, r1, r0], [a, b, c], [a, c, d]]); }

class Batch {
  constructor(gl, prog, geo) { this.gl = gl; this.n = 0; this.cap = 2048; this.data = new Float32Array(this.cap * 13); this.vc = geo.p.length / 3; this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao); const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); const d = new Float32Array(this.vc * 6); for (let i = 0; i < this.vc; i++) { d.set(geo.p.slice(i * 3, i * 3 + 3), i * 6); d.set(geo.n.slice(i * 3, i * 3 + 3), i * 6 + 3); } gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); const A = (nm, sz, st, off, div) => { const l = gl.getAttribLocation(prog, nm); if (l < 0) return; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, st, off); gl.vertexAttribDivisor(l, div); }; A('aPos', 3, 24, 0, 0); A('aNor', 3, 24, 12, 0); this.ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.ib); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW); A('iPos', 3, 52, 0, 1); A('iScl', 3, 52, 12, 1); A('iRot', 3, 52, 24, 1); A('iCol', 4, 52, 36, 1); gl.bindVertexArray(null); this.bufCap = this.cap; }
  begin() { this.n = 0; }
  push(x, y, z, sx, sy, sz, rx, ry, rz, r, g, b, e) { if (this.n >= this.cap) { this.cap *= 2; const d = new Float32Array(this.cap * 13); d.set(this.data); this.data = d; } const o = this.n * 13, D = this.data; D[o] = x; D[o + 1] = y; D[o + 2] = z; D[o + 3] = sx; D[o + 4] = sy; D[o + 5] = sz; D[o + 6] = rx; D[o + 7] = ry; D[o + 8] = rz; D[o + 9] = r; D[o + 10] = g; D[o + 11] = b; D[o + 12] = e; this.n++; }
  upload() { const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.ib); if (this.bufCap < this.cap) { gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW); this.bufCap = this.cap; } gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * 13); }
  draw() { if (!this.n) return; const gl = this.gl; gl.bindVertexArray(this.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vc, this.n); }
}

class Particles {
  constructor(max) { this.max = max; this.n = 0; const F = () => new Float32Array(max); this.x = F(); this.y = F(); this.z = F(); this.vx = F(); this.vy = F(); this.vz = F(); this.s = F(); this.gr = F(); this.life = F(); this.ml = F(); this.r = F(); this.g = F(); this.b = F(); this.a = F(); this.gv = F(); this.dr = F(); this.wd = F(); this.add = new Uint8Array(max); this.bufN = new Float32Array(max * 8); this.bufA = new Float32Array(max * 8); this.cn = 0; this.ca = 0; }
  one(x, y, z, vx, vy, vz, s, gr, life, r, g, b, a, add, gv, dr, wd) { let i; if (this.n < this.max) i = this.n++; else i = (Math.random() * this.max) | 0; this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz; this.s[i] = s; this.gr[i] = gr; this.life[i] = life; this.ml[i] = life; this.r[i] = r; this.g[i] = g; this.b[i] = b; this.a[i] = a; this.add[i] = add; this.gv[i] = gv; this.dr[i] = dr; this.wd[i] = wd; }
  burst(type, x, y, z, n, sp, pw) {
    const R = Math.random; sp = sp || 1; pw = pw || 1;
    for (let k = 0; k < n; k++) {
      const a = R() * 6.283, rr = Math.sqrt(R()) * sp, ox = Math.cos(a) * rr, oz = Math.sin(a) * rr;
      switch (type) {
        case 'dust': { const t = 0.55 + R() * 0.2; this.one(x + ox, y + R() * 0.5, z + oz, ox * 0.8 + (R() - .5), (0.4 + R() * 1.4) * pw, oz * 0.8 + (R() - .5), 0.7 + R() * 1.1, 1.3, 1.4 + R() * 1.8, t + 0.1, t, t - 0.12, 0.42, 0, -0.5, 1.6, 0.4); break; }
        case 'smoke': { const t = 0.1 + R() * 0.14; this.one(x + ox, y + R(), z + oz, (R() - .5) * 0.6, 1.4 + R() * 2.2 * pw, (R() - .5) * 0.6, 0.8 + R() * 0.9, 1.1, 3 + R() * 3.5, t, t, t, 0.5, 0, 0.3, 0.3, 1); break; }
        case 'fire': this.one(x + ox, y + R() * 0.4, z + oz, (R() - .5) * pw, (1.5 + R() * 2.5) * pw, (R() - .5) * pw, 0.5 + R() * 0.7 * Math.min(2, pw), -0.5, 0.35 + R() * 0.55, 1, 0.45 + R() * 0.3, 0.1, 0.85, 1, 0.5, 0.5, 0.3); break;
        case 'spark': this.one(x + ox, y, z + oz, (R() - .5) * 6 * pw, (2 + R() * 6) * pw, (R() - .5) * 6 * pw, 0.1 + R() * 0.1, 0, 0.6 + R() * 1.1, 1, 0.75, 0.3, 1, 1, -9, 0.3, 0.5); break;
        case 'splash': this.one(x + ox, y, z + oz, (R() - .5) * 2.5, 2.5 + R() * 3.5 * pw, (R() - .5) * 2.5, 0.2 + R() * 0.2, 0.2, 0.5 + R() * 0.4, 0.85, 0.92, 1, 0.7, 0, -12, 0.2, 0); break;
        case 'steam': this.one(x + ox, y, z + oz, (R() - .5), 2 + R() * 3, (R() - .5), 1 + R(), 1.8, 2.5 + R() * 2, 0.9, 0.9, 0.9, 0.4, 0, 0.2, 0.4, 1); break;
        case 'ring': { const s = (10 + R() * 5) * pw; this.one(x + Math.cos(a) * 0.5, y + R() * 0.4, z + Math.sin(a) * 0.5, Math.cos(a) * s, 0.5 + R(), Math.sin(a) * s, 1.2 + R() * 1.2, 2.5, 0.7 + R() * 0.5, 0.88, 0.83, 0.74, 0.5, 0, 0, 1.2, 0); break; }
        case 'rain': this.one(x + ox, y + R() * 6, z + oz, 0, -26, 0, 0.13, 0, 0.7, 0.7, 0.8, 0.95, 0.5, 0, 0, 0, 0.6); break;
        case 'ember': this.one(x + ox, y, z + oz, (R() - .5), 1 + R() * 2.5, (R() - .5), 0.1 + R() * 0.08, 0, 1.5 + R() * 2, 1, 0.6, 0.2, 1, 1, 0.3, 0.2, 1.5); break;
      }
    }
  }
  update(dt, wx, wz) {
    let cn = 0, ca = 0; const bn = this.bufN, ba = this.bufA;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { const l = --this.n; if (i !== l) { this.x[i] = this.x[l]; this.y[i] = this.y[l]; this.z[i] = this.z[l]; this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.vz[i] = this.vz[l]; this.s[i] = this.s[l]; this.gr[i] = this.gr[l]; this.life[i] = this.life[l]; this.ml[i] = this.ml[l]; this.r[i] = this.r[l]; this.g[i] = this.g[l]; this.b[i] = this.b[l]; this.a[i] = this.a[l]; this.add[i] = this.add[l]; this.gv[i] = this.gv[l]; this.dr[i] = this.dr[l]; this.wd[i] = this.wd[l]; i--; } continue; }
      const dk = Math.max(0, 1 - this.dr[i] * dt); this.vx[i] *= dk; this.vz[i] *= dk; this.vy[i] = this.vy[i] * dk + this.gv[i] * dt;
      this.x[i] += (this.vx[i] + wx * this.wd[i] * 2.5) * dt; this.y[i] += this.vy[i] * dt; this.z[i] += (this.vz[i] + wz * this.wd[i] * 2.5) * dt; this.s[i] = Math.max(0.02, this.s[i] + this.gr[i] * dt);
      const u = this.life[i] / this.ml[i], al = this.a[i] * (u < 0.7 ? u / 0.7 : Math.min(1, (1 - u) / 0.12 + 0.2));
      if (this.add[i]) { const o = ca * 8; ba[o] = this.x[i]; ba[o + 1] = this.y[i]; ba[o + 2] = this.z[i]; ba[o + 3] = this.s[i]; ba[o + 4] = this.r[i]; ba[o + 5] = this.g[i]; ba[o + 6] = this.b[i]; ba[o + 7] = al; ca++; }
      else { const o = cn * 8; bn[o] = this.x[i]; bn[o + 1] = this.y[i]; bn[o + 2] = this.z[i]; bn[o + 3] = this.s[i]; bn[o + 4] = this.r[i]; bn[o + 5] = this.g[i]; bn[o + 6] = this.b[i]; bn[o + 7] = al; cn++; }
    }
    this.cn = cn; this.ca = ca;
  }
}

class Renderer {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.canvas = canvas;
    const mk = (vs, fs) => { const c = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; }; const p = gl.createProgram(); gl.attachShader(p, c(gl.VERTEX_SHADER, vs)); gl.attachShader(p, c(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); p.u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name.replace('[0]', ''); p.u[nm] = gl.getUniformLocation(p, nm); } return p; };
    this.pT = mk(TERR_VS, TERR_FS); this.pW = mk(WAT_VS, WAT_FS); this.pI = mk(INS_VS, INS_FS); this.pP = mk(PAR_VS, PAR_FS);
    // terrain
    this.tv = new Float32Array(NN * 7); this.wv = new Float32Array(NN * 5);
    const idx = new Uint32Array((N - 1) * (N - 1) * 6); let k = 0;
    for (let z = 0; z < N - 1; z++) for (let x = 0; x < N - 1; x++) { const a = z * N + x, b = a + 1, c = a + N, d = c + 1; if ((x + z) & 1) { idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d; } else { idx[k++] = a; idx[k++] = c; idx[k++] = d; idx[k++] = a; idx[k++] = d; idx[k++] = b; } }
    const mkGrid = (prog, data, attrs, stride) => { const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW); for (const [nm, sz, off] of attrs) { const l = gl.getAttribLocation(prog, nm); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, stride, off); } const eb = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eb); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); gl.bindVertexArray(null); return { vao, vb }; };
    this.tm = mkGrid(this.pT, this.tv, [['aPos', 3, 0], ['aCol', 3, 12], ['aGlow', 1, 24]], 28);
    this.wm = mkGrid(this.pW, this.wv, [['aPos', 3, 0], ['aDF', 2, 12]], 20);
    this.ic = idx.length;
    // sea quad
    this.sea = gl.createVertexArray(); gl.bindVertexArray(this.sea); const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb); const S = 900, y = -0.04; gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-S, y, -S, 3, 0, N + S, y, -S, 3, 0, N + S, y, N + S, 3, 0, -S, y, -S, 3, 0, N + S, y, N + S, 3, 0, -S, y, N + S, 3, 0]), gl.STATIC_DRAW); { const l = gl.getAttribLocation(this.pW, 'aPos'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 20, 0); const m = gl.getAttribLocation(this.pW, 'aDF'); gl.enableVertexAttribArray(m); gl.vertexAttribPointer(m, 2, gl.FLOAT, false, 20, 12); } gl.bindVertexArray(null);
    const G = [geoBox(), geoPyr(), geoPrism()];
    this.st = G.map(g => new Batch(gl, this.pI, g)); this.dy = G.map(g => new Batch(gl, this.pI, g));
    // particles
    this.pvao = gl.createVertexArray(); gl.bindVertexArray(this.pvao); this.pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.pb); gl.bufferData(gl.ARRAY_BUFFER, 7000 * 32, gl.DYNAMIC_DRAW); { const l = gl.getAttribLocation(this.pP, 'aPS'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 32, 0); const m = gl.getAttribLocation(this.pP, 'aCol'); gl.enableVertexAttribArray(m); gl.vertexAttribPointer(m, 4, gl.FLOAT, false, 32, 16); } gl.bindVertexArray(null);
    this.parts = new Particles(7000);
    this.cam = { tx: 80, tz: 100, yaw: 0.6, pitch: 0.75, dist: 70, gtx: 80, gtz: 100, gyaw: 0.6, gpitch: 0.75, gdist: 70, shake: 0 };
    this.eye = [0, 0, 0]; this.fov = 0.7; this.lights = new Float32Array(24); this.mark = [0, 0, 0, 0]; this.markC = [1, 1, 1, 0]; this.shadow = [0, 0, 1, 0];
    this.time = 0; this.sel = null; this.extra = null;
  }
  resize() { const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 1.5), w = Math.max(2, (c.clientWidth * dpr) | 0), h = Math.max(2, (c.clientHeight * dpr) | 0); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } }

  updateCam(dt, world) {
    const c = this.cam, k = 1 - Math.exp(-dt * 9);
    c.gtx = clamp(c.gtx, 2, N - 3); c.gtz = clamp(c.gtz, 2, N - 3); c.gpitch = clamp(c.gpitch, 0.3, 1.45); c.gdist = clamp(c.gdist, 7, 230);
    c.tx += (c.gtx - c.tx) * k; c.tz += (c.gtz - c.tz) * k; c.yaw += (c.gyaw - c.yaw) * k; c.pitch += (c.gpitch - c.pitch) * k; c.dist += (c.gdist - c.dist) * k;
    c.shake = Math.max(0, c.shake - dt * 2.2);
    const ty = Math.max(0, world.hAt(c.tx, c.tz)) + 0.5, cp = Math.cos(c.pitch), sh = c.shake * c.shake * Math.min(3, c.dist * 0.03 + 0.4);
    const tx = c.tx + (Math.random() - .5) * sh, tz = c.tz + (Math.random() - .5) * sh, tyy = ty + (Math.random() - .5) * sh;
    this.tgt = [tx, tyy, tz];
    this.eye = [tx + Math.sin(c.yaw) * cp * c.dist, tyy + Math.sin(c.pitch) * c.dist, tz + Math.cos(c.yaw) * cp * c.dist];
    const gy = world.hAt(clamp(this.eye[0], 0, N - 1), clamp(this.eye[2], 0, N - 1)) + 1.5; if (this.eye[1] < gy) this.eye[1] = gy;
    const asp = this.canvas.width / this.canvas.height; this.asp = asp;
    this.P = M4.persp(this.fov, asp, 0.5, 1200); this.V = M4.look(this.eye, this.tgt, [0, 1, 0]); this.VP = M4.mul(this.P, this.V);
  }
  ray(mx, my) { // mx,my in [-1,1]
    const e = this.eye, t = this.tgt; let fx = t[0] - e[0], fy = t[1] - e[1], fz = t[2] - e[2], l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
    let rx = -fz, rz = fx, rl = Math.hypot(rx, rz); rx /= rl; rz /= rl; const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    const th = Math.tan(this.fov / 2); let dx = fx + rx * mx * th * this.asp + ux * my * th, dy = fy + uy * my * th, dz = fz + rz * mx * th * this.asp + uz * my * th; l = Math.hypot(dx, dy, dz); return [dx / l, dy / l, dz / l];
  }
  pick(mx, my, world) {
    const d = this.ray(mx, my), e = this.eye; let t = 0, pt = 0; const inside = (x, z) => x >= 0 && z >= 0 && x <= N - 1 && z <= N - 1;
    for (let s = 0; s < 900; s++) { pt = t; t += 0.4 + t * 0.012; const x = e[0] + d[0] * t, y = e[1] + d[1] * t, z = e[2] + d[2] * t; if (y < -3) return null; if (inside(x, z) && y < world.hAt(x, z)) { let a = pt, b = t; for (let k = 0; k < 10; k++) { const m = (a + b) / 2, X = e[0] + d[0] * m, Z = e[2] + d[2] * m; if (inside(X, Z) && e[1] + d[1] * m < world.hAt(X, Z)) b = m; else a = m; } return { x: e[0] + d[0] * b, z: e[2] + d[2] * b, y: e[1] + d[1] * b }; } }
    return null;
  }
  project(x, y, z) { const m = this.VP, w = m[3] * x + m[7] * y + m[11] * z + m[15]; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, w]; }

  buildTerrain(w) {
    const tv = this.tv, h = w.h, kind = w.kind;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, o = i * 7, hv = h[i], nz = hash2(x, z, 7), k = kind[i];
      let r, g, b;
      const xm = x > 0 ? i - 1 : i, xp = x < N - 1 ? i + 1 : i, zm = z > 0 ? i - N : i, zp = z < N - 1 ? i + N : i;
      const sl = Math.max(Math.abs(h[xp] - h[xm]), Math.abs(h[zp] - h[zm])) * 0.5;
      if (k === K.GRASS) { r = 0.34 + nz * 0.06; g = 0.55 + nz * 0.07; b = 0.24; }
      else if (k === K.FOREST) { r = 0.22 + nz * 0.04; g = 0.40 + nz * 0.06; b = 0.19; }
      else if (k === K.FARM) { if (z & 1) { r = 0.80; g = 0.69; b = 0.30; } else { r = 0.60; g = 0.62; b = 0.26; } if (w.fuel[i] < 0.2) { r = 0.5; g = 0.42; b = 0.28; } }
      else if (k === K.ROAD) { r = 0.63 + nz * 0.04; g = 0.54 + nz * 0.04; b = 0.41; }
      else if (k === K.DAM) { r = 0.66; g = 0.66; b = 0.64 + nz * 0.04; }
      else if (k === K.SAND) { r = 0.74 + nz * 0.04; g = 0.68 + nz * 0.04; b = 0.50; }
      else { r = 0.5; g = 0.48; b = 0.46; }
      if (k !== K.DAM && k !== K.ROAD) {
        const rk = clamp((sl - 0.75) * 2.5, 0, 1) + clamp((hv - 15) * 0.4, 0, 1); if (rk > 0) { const t = Math.min(1, rk), q = 0.44 + nz * 0.1; r += (q - r) * t; g += (q * 0.97 - g) * t; b += (q * 0.94 - b) * t; }
        if (hv > 21) { const t = clamp((hv - 21) * 0.5, 0, 1) * (sl < 2.2 ? 1 : 0.3); r += (0.93 - r) * t; g += (0.95 - g) * t; b += (0.98 - b) * t; }
      }
      const m = w.mud[i]; if (m) { const t = m / 255 * 0.8; r += (0.42 - r) * t; g += (0.33 - g) * t; b += (0.22 - b) * t; }
      const c = w.crack[i]; if (c) { const t = Math.min(0.9, c / 255 * 1.5 + 0.25); r += (0.19 - r) * t; g += (0.15 - g) * t; b += (0.12 - b) * t; }
      const s = w.scorch[i]; if (s) { const t = s / 255 * 0.9; r += (0.09 - r) * t; g += (0.08 - g) * t; b += (0.075 - b) * t; }
      if (hv < 0.25) { const t = clamp((0.25 - hv) * 1.2, 0, 1); r += (0.55 - r) * t; g += (0.52 - g) * t; b += (0.4 - b) * t; }
      if (w.w[i] > 0.08) { r *= 0.72; g *= 0.76; b *= 0.8; }
      tv[o] = x; tv[o + 1] = hv; tv[o + 2] = z; tv[o + 3] = r; tv[o + 4] = g; tv[o + 5] = b; tv[o + 6] = w.burn[i];
    }
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.tm.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, tv);
  }
  buildWater(w) {
    const wv = this.wv, h = w.h, ww = w.w, fl = w.flow;
    for (let i = 0, o = 0; i < NN; i++, o += 5) { const d = ww[i]; wv[o] = i % N; wv[o + 1] = h[i] + d - (d < 0.03 ? 0.06 : 0); wv[o + 2] = (i / N) | 0; wv[o + 3] = d; wv[o + 4] = (w.flag[i] & 2) ? 0 : fl[i]; }
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.wm.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, wv);
  }
  buildStatic(w) {
    const [B, P, R] = this.st; B.begin(); P.begin(); R.begin();
    const tree = w.tree, h = w.h;
    for (let i = 0; i < NN; i++) {
      const t = tree[i]; if (!t) continue; const x = i % N, z = (i / N) | 0, a = hash2(x, z, 3), b = hash2(x, z, 4), c = hash2(x, z, 5);
      const px = x + a * 0.7 - 0.35, pz = z + b * 0.7 - 0.35, y = h[i] - 0.05, s = 0.8 + c * 0.7, ry = c * 6.28;
      if (t === 1 || t === 2) {
        const e = t === 2 ? 0.7 : 0; B.push(px, y + 0.3 * s, pz, 0.16 * s, 0.6 * s, 0.16 * s, 0, ry, 0, 0.36, 0.25, 0.16, 0);
        if (a < 0.62) { const g = t === 2 ? [0.95, 0.45, 0.1] : [0.13 + b * 0.07, 0.36 + c * 0.1, 0.17]; P.push(px, y + 1.1 * s, pz, 0.95 * s, 1.3 * s, 0.95 * s, 0, ry, 0, g[0], g[1], g[2], e); P.push(px, y + 1.85 * s, pz, 0.66 * s, 1.0 * s, 0.66 * s, 0, ry + 0.6, 0, g[0] * 1.1, g[1] * 1.1, g[2] * 1.1, e); }
        else { const g = t === 2 ? [0.95, 0.45, 0.1] : [0.27 + b * 0.1, 0.5 + c * 0.1, 0.18]; B.push(px, y + 1.0 * s, pz, 0.85 * s, 0.75 * s, 0.85 * s, 0, ry, 0, g[0], g[1], g[2], e); B.push(px + 0.15, y + 1.5 * s, pz - 0.1, 0.55 * s, 0.5 * s, 0.55 * s, 0, ry + 0.8, 0, g[0] * 1.08, g[1] * 1.08, g[2] * 1.08, e); }
      }
      else if (t === 3) { B.push(px, y + 0.5 * s, pz, 0.11 * s, 1.1 * s, 0.11 * s, a * 0.2 - 0.1, ry, b * 0.2 - 0.1, 0.07, 0.06, 0.06, 0); B.push(px + 0.1, y + 0.75 * s, pz, 0.06, 0.45 * s, 0.06, 0, ry, 0.8, 0.07, 0.06, 0.06, 0); }
      else if (t === 4) { B.push(px, y + 0.14, pz, 0.16 * s, 1.5 * s, 0.16 * s, Math.PI / 2, ry, 0, 0.33, 0.23, 0.15, 0); P.push(px + Math.sin(ry) * 1.2 * s, y + 0.35, pz + Math.cos(ry) * 1.2 * s, 0.8 * s, 1.2 * s, 0.8 * s, Math.PI / 2, ry, 0, 0.25, 0.33, 0.14, 0); }
      else B.push(px, y + 0.08, pz, 1.0 * s, 0.07, 1.0 * s, 0, ry, 0, 0.2, 0.27, 0.13, 0);
    }
    for (const r of w.rubble) this.st[r[9]].push(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[10], r[11], r[12], 0);
    const wl = w.well, wy = w.hAt(wl.x, wl.z); B.push(wl.x, wy + 0.3, wl.z, 1.1, 0.6, 1.1, 0, 0.3, 0, 0.55, 0.53, 0.5, 0); B.push(wl.x - 0.5, wy + 0.9, wl.z, 0.1, 1.2, 0.1, 0, 0.3, 0, 0.36, 0.25, 0.17, 0); B.push(wl.x + 0.5, wy + 0.9, wl.z, 0.1, 1.2, 0.1, 0, 0.3, 0, 0.36, 0.25, 0.17, 0); R.push(wl.x, wy + 1.65, wl.z, 1.5, 0.45, 1.3, 0, 0.3, 0, 0.5, 0.3, 0.24, 0);
    for (const b of this.st) b.upload();
  }
  buildDynamic(w) {
    const D = this.dy; for (const b of D) b.begin(); const [B, P] = D, T = this.time;
    const night = w.time < 0.24 || w.time > 0.8;
    for (const b of w.buildings) {
      const sh = b.shake || 0, fl = b.fire > 0 ? b.fire * (0.3 + 0.2 * Math.sin(T * 17 + b.id)) : 0;
      for (let j = 0; j < b.parts.length; j++) {
        const p = b.parts[j]; if (p.st) continue; const ch = p.char * 0.85; let r = p.c[0] * (1 - ch) + 0.08 * ch, g = p.c[1] * (1 - ch) + 0.07 * ch, bl = p.c[2] * (1 - ch) + 0.07 * ch, e = p.role === 'base' ? 0 : fl;
        if (p.win && night && !b.ruin && b.fire <= 0 && (b.id * 7 + j) % 3) { r = 1; g = 0.78; bl = 0.38; e = 0.9; }
        let rx = 0, rz = 0, ox = 0, oy = 0; const ln = p.lean;
        if (ln > 0 && p.role !== 'base') { if (p.role === 'wall') { if (p.sx > p.sz) rx = ln * 0.3 * (p.oz < 0 ? -1 : 1); else rz = ln * 0.3 * (p.ox < 0 ? 1 : -1); } else if (p.role === 'sup') { rx = ln * 0.25 * p.ls; rz = ln * 0.2 * -p.ls; } else if (p.role !== 'decor') { rz = ln * 0.16 * p.ls; oy = -ln * 0.18; } }
        if (sh > 0 && p.role !== 'base') { rx += Math.sin(T * 43 + j * 1.7) * sh * 0.06; rz += Math.cos(T * 37 + j * 2.3) * sh * 0.06; ox = Math.sin(T * 51 + j) * sh * 0.07; }
        D[p.g].push(b.x + p.ox + ox, b.y + p.oy + oy, b.z + p.oz, p.sx, p.sy, p.sz, rx, p.ry, rz, r, g, bl, e);
      }
    }
    for (const d of w.debris) D[d.g].push(d.x, d.y, d.z, d.sx, d.sy, d.sz, d.rx, d.ry, d.rz, d.c[0], d.c[1], d.c[2], d.hot ? 0.8 : 0);
    for (const n of w.npcs) {
      if (n.inside) continue; const s = n.child ? 0.68 : 1, c = n.c;
      if (n.st === DEAD) { if (n.deadT >= 999) continue; if (n.flat) B.push(n.x, n.y + 0.03, n.z, 0.5, 0.04, 0.3, 0, n.face, 0, c[0] * 0.5, c[1] * 0.3, c[2] * 0.3, 0); else { B.push(n.x, n.y + 0.1, n.z, 0.26 * s, 0.44 * s, 0.18 * s, Math.PI / 2, n.face, 0, c[0] * 0.55, c[1] * 0.55, c[2] * 0.55, 0); B.push(n.x + Math.sin(n.face) * 0.32 * s, n.y + 0.1, n.z + Math.cos(n.face) * 0.32 * s, 0.18 * s, 0.18 * s, 0.18 * s, 0, n.face, 0, 0.62, 0.5, 0.42, 0); } continue; }
      const ci = w.ci(n.x, n.z), wd = w.bridgeOK(ci) ? 0 : w.w[ci]; let y = n.y, rx = 0;
      const e = n.onFire > 0 ? 0.8 : 0, pan = n.st === PANIC;
      if (n.moving) y += Math.abs(Math.sin(T * (pan ? 16 : 9) + n.id)) * 0.07;
      if (n.st === STUMBLE) { rx = 1.25; y -= 0.12; } else if (n.working) rx = 0.25 + Math.sin(T * 4 + n.id) * 0.25;
      if (wd > 0.7) y = w.h[ci] + wd - 0.62 * s;
      const cr = e ? 1 : c[0], cg = e ? 0.5 : c[1], cb = e ? 0.15 : c[2];
      B.push(n.x, y + 0.33 * s, n.z, 0.26 * s, 0.44 * s, 0.18 * s, rx, n.face, 0, cr, cg, cb, e);
      const hx = Math.sin(n.face) * Math.sin(rx) * 0.4 * s, hz = Math.cos(n.face) * Math.sin(rx) * 0.4 * s;
      B.push(n.x + hx, y + (0.33 + 0.33 * Math.cos(rx)) * s, n.z + hz, 0.18 * s, 0.18 * s, 0.18 * s, rx, n.face, 0, 0.9, 0.72, 0.58, 0);
      if (pan) { const ax = Math.cos(n.face) * 0.17 * s, az = -Math.sin(n.face) * 0.17 * s, wv = Math.sin(T * 14 + n.id) * 0.25; B.push(n.x + ax, y + 0.72 * s, n.z + az, 0.07, 0.3 * s, 0.07, 0, n.face, 0.3 + wv, cr, cg, cb, e); B.push(n.x - ax, y + 0.72 * s, n.z - az, 0.07, 0.3 * s, 0.07, 0, n.face, -0.3 - wv, cr, cg, cb, e); }
      if (n === this.sel) P.push(n.x, y + 1.25, n.z, 0.3, 0.35, 0.3, Math.PI, T * 2, 0, 1, 0.85, 0.2, 1);
    }
    for (const m of w.meteors) { const s = 1 + m.I * 1.6; B.push(m.px, m.py, m.pz, s, s * 0.85, s, m.t * 5, m.t * 3, m.t * 4, 1, 0.55, 0.2, 1); B.push(m.px, m.py, m.pz, s * 0.75, s * 0.9, s * 0.8, m.t * 3 + 1, m.t * 6, 0.7, 0.25, 0.18, 0.15, 0.2); }
    for (const c of w.camps) { if (c.dead) continue; const y = w.hAt(c.x, c.z); B.push(c.x, y + 0.08, c.z, 0.8, 0.12, 0.14, 0, 0.5, 0, 0.3, 0.2, 0.13, 0); B.push(c.x, y + 0.1, c.z, 0.8, 0.12, 0.14, 0, 2.1, 0, 0.3, 0.2, 0.13, 0); P.push(c.x, y + 0.3, c.z, 0.35, 0.5 + 0.1 * Math.sin(T * 15), 0.35, 0, T, 0, 1, 0.6, 0.15, 1); }
    if (this.extra) this.extra(B, P);
    for (const b of D) b.upload();
  }

  env(w) {
    const a = (w.time - 0.25) * 6.2832, el = Math.sin(a), day = sstep(-0.12, 0.22, el), dusk = clamp(1 - Math.abs(el) / 0.3, 0, 1) * 0.8;
    let sx = Math.cos(a) * 0.65, sy = Math.abs(el) * 0.9 + 0.25, sz = 0.45; const l = Math.hypot(sx, sy, sz); this.sun = [sx / l, sy / l, sz / l];
    const mix = (n, d, k) => [n[0] + (d[0] - n[0]) * k, n[1] + (d[1] - n[1]) * k, n[2] + (d[2] - n[2]) * k];
    let sc = mix([0.34, 0.4, 0.6], [1.0, 0.95, 0.84], day), am = mix([0.27, 0.31, 0.46], [0.44, 0.48, 0.55], day), fg = mix([0.09, 0.12, 0.22], [0.62, 0.78, 0.92], day);
    sc = mix(sc, [1.0, 0.6, 0.35], dusk * 0.6); fg = mix(fg, [0.93, 0.62, 0.45], dusk * 0.55);
    if (w.rain > 0) { fg = mix(fg, [0.45, 0.5, 0.56], 0.6 * day + 0.1); sc = mix(sc, [0.5, 0.52, 0.56], 0.5); }
    const sm = Math.min(0.5, w.fires.length / 2500); fg = mix(fg, [0.35, 0.27, 0.22], sm); sc = mix(sc, [0.9, 0.5, 0.3], sm * 0.8);
    this.sunC = sc; this.amb = am; this.fogC = fg;
  }
  setLights(w) {
    const L = []; for (const m of w.meteors) L.push([m.px, m.py, m.pz, 5]);
    for (const b of w.buildings) if (b.fire > 0) L.push([b.x, b.y + b.hgt + 1, b.z, 1.2 + b.fire * 1.8]);
    for (const c of w.camps) if (!c.dead) L.push([c.x, w.hAt(c.x, c.z) + 0.8, c.z, 0.9]);
    if (w.fires.length) { const bk = this._bk || (this._bk = new Float32Array(100 * 3)); bk.fill(0); const F = w.fires, st = Math.max(1, (F.length / 600) | 0); for (let k = 0; k < F.length; k += st) { const i = F[k], x = i % N, z = (i / N) | 0, q = ((z >> 4) * 10 + (x >> 4)) * 3; bk[q] += x; bk[q + 1] += z; bk[q + 2] += 1; } for (let q = 0; q < 300; q += 3) if (bk[q + 2] > 0) { const x = bk[q] / bk[q + 2], z = bk[q + 1] / bk[q + 2]; L.push([x, w.hAt(x, z) + 2.5, z, Math.min(3.5, 0.5 + bk[q + 2] * st * 0.03)]); } }
    const c = this.cam; L.sort((a, b) => (b[3] / (1 + Math.hypot(b[0] - c.tx, b[2] - c.tz) * 0.02)) - (a[3] / (1 + Math.hypot(a[0] - c.tx, a[2] - c.tz) * 0.02)));
    const fl = 0.85 + 0.15 * Math.sin(this.time * 19); for (let k = 0; k < 6; k++) { const o = k * 4, e = L[k]; if (e) { this.lights[o] = e[0]; this.lights[o + 1] = e[1]; this.lights[o + 2] = e[2]; this.lights[o + 3] = e[3] * fl; } else this.lights[o + 3] = 0; }
  }

  draw(w, dt) {
    const gl = this.gl; this.time += dt; this.resize();
    if (w.terrDirty) { this.buildTerrain(w); w.terrDirty = false; }
    if (w.staticDirty) { this.buildStatic(w); w.staticDirty = false; }
    this.buildWater(w); this.buildDynamic(w); this.env(w); this.setLights(w);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clearColor(this.fogC[0], this.fogC[1], this.fogC[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    const fogD = 0.0000028 + (w.rain > 0 ? 0.000004 : 0);
    const common = p => { gl.useProgram(p); gl.uniformMatrix4fv(p.u.uVP, false, this.VP); if (p.u.uSun) gl.uniform3fv(p.u.uSun, this.sun); if (p.u.uSunC) gl.uniform3fv(p.u.uSunC, this.sunC); if (p.u.uAmb) gl.uniform3fv(p.u.uAmb, this.amb); if (p.u.uFog) gl.uniform3fv(p.u.uFog, this.fogC); if (p.u.uCam) gl.uniform3fv(p.u.uCam, this.eye); if (p.u.uFogD) gl.uniform1f(p.u.uFogD, fogD); if (p.u.uLights) gl.uniform4fv(p.u.uLights, this.lights); if (p.u.uTime) gl.uniform1f(p.u.uTime, this.time); };
    common(this.pT); gl.uniform4fv(this.pT.u.uMark, this.mark); gl.uniform4fv(this.pT.u.uMarkC, this.markC); gl.uniform4fv(this.pT.u.uShadow, this.shadow);
    gl.bindVertexArray(this.tm.vao); gl.drawElements(gl.TRIANGLES, this.ic, gl.UNSIGNED_INT, 0);
    common(this.pI); for (const b of this.st) b.draw(); for (const b of this.dy) b.draw();
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    common(this.pW); gl.bindVertexArray(this.sea); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.bindVertexArray(this.wm.vao); gl.drawElements(gl.TRIANGLES, this.ic, gl.UNSIGNED_INT, 0);
    const ps = this.parts; ps.update(dt, w.wind[0], w.wind[1]);
    gl.useProgram(this.pP); gl.uniformMatrix4fv(this.pP.u.uVP, false, this.VP); gl.uniform1f(this.pP.u.uPx, this.canvas.height * this.P[5] * 0.5);
    gl.bindVertexArray(this.pvao); gl.bindBuffer(gl.ARRAY_BUFFER, this.pb);
    if (ps.cn) { gl.bufferSubData(gl.ARRAY_BUFFER, 0, ps.bufN, 0, ps.cn * 8); gl.drawArrays(gl.POINTS, 0, ps.cn); }
    if (ps.ca) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.bufferSubData(gl.ARRAY_BUFFER, 0, ps.bufA, 0, ps.ca * 8); gl.drawArrays(gl.POINTS, 0, ps.ca); }
    gl.depthMask(true); gl.bindVertexArray(null);
  }
}
