'use strict';

// Ring sections share vertices around each digit. The shader bends the centreline
// and rotates its cross section together, so there are no joints to pull apart.
const HAND_VS = `#version 300 es
in vec3 aSection; in vec3 aRoot; in vec3 aShape;
uniform mat4 uVP;
uniform vec3 uOrigin;
uniform float uSize,uYaw,uCurl[5];
out vec3 vLocal;
void main() {
  vec3 p = aSection;
  if (aShape.z >= 0.0) {
    float curl = max(0.012, uCurl[int(aShape.z)]);
    float angle = aSection.z * curl;
    float radius = aShape.x / curl;
    float forward = sin(angle) * (radius + aSection.y);
    float height = (cos(angle)-1.0)*radius + cos(angle)*aSection.y;
    float s = sin(aShape.y), c = cos(aShape.y);
    p = aRoot + vec3(aSection.x*c + forward*s, height, aSection.x*s - forward*c);
  }
  // Lift the wrist and roll the thumb side toward the viewer.
  p.y += 0.28*p.z - 0.18*p.x;
  vLocal = p;
  vec3 rotated = vec3(cos(uYaw)*p.x + sin(uYaw)*p.z, p.y, -sin(uYaw)*p.x + cos(uYaw)*p.z);
  gl_Position = uVP * vec4(uOrigin + uSize*rotated, 1.0);
}`;
const HAND_FS = `#version 300 es
precision highp float;
in vec3 vLocal; uniform vec3 uTint; out vec4 color;
void main() {
  vec3 n = normalize(cross(dFdx(vLocal),dFdy(vLocal)));
  float light = 0.5 + 0.5*dot(n, normalize(vec3(-0.55,0.85,-0.3)));
  vec3 shade = mix(vec3(0.035,0.27,0.46), uTint, smoothstep(0.1,0.94,light));
  color = vec4(shade, 0.73);
}`;

function makeHandMesh() {
  const vertices = [], indices = [], sides = 14;
  function section(rings, root, shape) {
    const first = vertices.length / 9;
    for (const [x, y, z, width, thickness] of rings) {
      for (let j = 0; j < sides; j++) {
        const angle = j*2*Math.PI/sides;
        vertices.push(x + width*Math.cos(angle), y + thickness*Math.sin(angle), z, ...root, ...shape);
      }
    }
    for (let i = 1; i < rings.length; i++) {
      for (let j = 0; j < sides; j++) {
        const a = first+(i-1)*sides+j, b = first+(i-1)*sides+(j+1)%sides;
        indices.push(a,b,b+sides,a,b+sides,a+sides);
      }
    }
  }
  // The wrist widens into the heel, palm and knuckles.
  section([[0,0,2.75,0.01,0.01],[0,0,2.68,0.48,0.28],[0,0,2.45,0.54,0.32],
    [0,0,1.55,0.46,0.29],[-0.04,0,1.12,0.66,0.34],[-0.06,0,0.62,0.82,0.36],
    [0,0,0.1,0.83,0.32],[0,0,-0.23,0.74,0.24],[0,0,-0.31,0.52,0.14],
    [0,0,-0.32,0.01,0.01]], [0,0,0], [0,0,-1]);
  const digits = [
    [-0.53,-0.17,1.48,0.196,-0.14],[-0.15,-0.22,1.62,0.197,-0.035],
    [0.23,-0.17,1.49,0.184,0.085],[0.56,0,1.18,0.157,0.21],
    [-0.52,0.91,1.35,0.24,-0.85]
  ];
  digits.forEach(([x,z,length,radius,splay], digit) => {
    const rings = [[0,1],[0.18,1.02],[0.39,0.9],[0.52,0.92],[0.67,0.77],
      [0.79,0.78],[0.91,0.69],[0.97,0.51],[1,0.06]]
      .map(([distance,width]) => [0,0,distance,radius*width,radius*width*0.87]);
    section(rings, [x,digit === 4 ? -0.12 : 0,z], [length,splay,digit]);
  });
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

const HAND_POSES = {
  idle: [0.68,0.82,1.03,1.18,0.68],
  point: [0.15,1.63,1.94,2.03,0.85],
  open: [0.06,0.12,0.19,0.27,0.14],
  grasp: [1.8,2.15,2.28,2.35,1.6]
};
const HAND_TINT = {
  observe:[0.42,0.94,1], quake:[1,0.72,0.36], flood:[0.35,0.84,1], meteor:[1,0.53,0.36],
  finger:[0.64,1,0.83], fire:[1,0.66,0.28], lightning:[0.78,0.76,1], tornado:[0.54,1,0.93]
};

class GodHand {
  constructor(gl, makeProgram) {
    this.gl = gl;
    this.program = makeProgram(HAND_VS,HAND_FS);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const mesh = makeHandMesh();
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);
    for (const [index,name] of ['aSection','aRoot','aShape'].entries()) {
      const loc = gl.getAttribLocation(this.program,name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc,3,gl.FLOAT,false,36,index*12);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.count = mesh.indices.length;
    this.curl = new Float32Array(HAND_POSES.idle);
    this.tint = new Float32Array(HAND_TINT.observe);
    this.origin = new Float32Array(3);
    this.pulse = 0;
    this.visible = false;
  }

  cast(hit) {
    this.lastHit = hit;
    this.pulse = 0.24;
  }

  update(dt, renderer, world, hidden, hit, tool, held, press) {
    this.pulse = Math.max(0,this.pulse-dt);
    if (hidden) this.pulse = 0;
    // A released touch still gets a brief cast at its original target.
    const target = hit || (this.pulse > 0 && this.lastHit);
    if (hidden || !target) { this.visible = false; return; }
    const blend = 1-Math.exp(-22*dt);
    const casting = held || this.pulse > 0;
    this.pose = tool === 'observe' ? 'idle' : 'point';
    if (casting && tool !== 'finger') this.pose = tool === 'quake' || tool === 'tornado' ? 'grasp' : 'open';
    for (let i=0;i<5;i++) this.curl[i] += (HAND_POSES[this.pose][i]-this.curl[i])*blend;
    for (let i=0;i<3;i++) this.tint[i] += (HAND_TINT[tool][i]-this.tint[i])*blend;
    this.yaw = renderer.cam.yaw + 0.78;
    const [ex,ey,ez] = renderer.eye;
    this.size = clamp(Math.hypot(ex-target.x,ey-target.y,ez-target.z)*0.025,0.28,5);
    // Anchor the extended index finger beside the ground marker. On impact
    // it touches the same fixed strike point used by Divine Finger.
    const reach = 1.62, side = 0.73, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const cell = world.ci(target.x,target.z);
    const building = world.buildings[world.bmap[cell]-1];
    const roof = building && !building.ruin && !building.gone ? building.y+building.hgt : target.y;
    const surface = Math.max(target.y+world.w[cell], roof)*(1-press) + target.y*press;
    const lift = (1.32-0.72*press + 0.055*Math.sin(renderer.time*2.4))*this.size;
    const smoothing = this.visible && !press ? blend : 1;
    this.origin[0] += (target.x+(s*reach+c*side)*this.size-this.origin[0])*smoothing;
    this.origin[1] += (surface+lift-this.origin[1])*smoothing;
    this.origin[2] += (target.z+(c*reach-s*side)*this.size-this.origin[2])*smoothing;
    this.visible = true;
  }

  draw(renderer) {
    if (!this.visible) return;
    const gl = this.gl, u = this.program.u;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(u.uVP,false,renderer.VP);
    gl.uniform3fv(u.uOrigin,this.origin);
    gl.uniform1f(u.uSize,this.size);
    gl.uniform1f(u.uYaw,this.yaw);
    gl.uniform1fv(u.uCurl,this.curl);
    gl.uniform3fv(u.uTint,this.tint);
    gl.bindVertexArray(this.vao);
    // Only blend the nearest surface, including at overlapping finger roots.
    gl.depthMask(true);
    gl.colorMask(false,false,false,false);
    gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0);
    gl.colorMask(true,true,true,true);
    gl.depthFunc(gl.EQUAL);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0);
    gl.depthFunc(gl.LESS);
  }
}
