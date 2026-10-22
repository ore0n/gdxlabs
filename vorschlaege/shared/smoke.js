/* Background smoke from wp-content/uploads/2018/09/pixi-smoke.js, same shader and
   colours, drawn with plain WebGL so it needs neither PIXI 2 nor jQuery and runs
   in every current browser. Usage: <canvas id="smoke"></canvas> + this script. */
(function () {
  'use strict';
  var canvas = document.getElementById('smoke');
  if (!canvas) return;
  var gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) { canvas.style.display = 'none'; return; }

  var vertex = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  var fragment = [
    'precision mediump float;',
    'uniform vec2 resolution; uniform float time; uniform vec2 speed; uniform float shift;',
    'float rand(vec2 n) { return fract(cos(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }',
    'float noise(vec2 n) {',
    '  const vec2 d = vec2(0.0, 1.0);',
    '  vec2 b = floor(n), f = smoothstep(vec2(0.0), vec2(1.0), fract(n));',
    '  return mix(mix(rand(b), rand(b + d.yx), f.x), mix(rand(b + d.xy), rand(b + d.yy), f.x), f.y);',
    '}',
    'float fbm(vec2 n) {',
    '  float total = 0.0, amplitude = 1.0;',
    '  for (int i = 0; i < 4; i++) { total += noise(n) * amplitude; n += n; amplitude *= 0.5; }',
    '  return total;',
    '}',
    'void main() {',
    '  const vec3 c1 = vec3(126.0/255.0, 0.0, 97.0/255.0);',
    '  const vec3 c2 = vec3(173.0/255.0, 0.0, 161.4/255.0);',
    '  const vec3 c3 = vec3(0.2, 0.0, 0.0);',
    '  const vec3 c4 = vec3(164.0/255.0, 1.0/255.0, 214.4/255.0);',
    '  const vec3 c5 = vec3(0.1);',
    '  const vec3 c6 = vec3(0.9);',
    '  vec2 p = gl_FragCoord.xy * 8.0 / resolution.xx;',
    '  float q = fbm(p - time * 0.1);',
    '  vec2 r = vec2(fbm(p + q + time * speed.x - p.x - p.y), fbm(p + q - time * speed.y));',
    '  vec3 c = mix(c1, c2, fbm(p + r)) + mix(c3, c4, r.x) - mix(c5, c6, r.y);',
    '  float grad = gl_FragCoord.y / resolution.y;',
    '  gl_FragColor = vec4(c * cos(shift * gl_FragCoord.y / resolution.y), 1.0);',
    '  gl_FragColor.r = 0.0;',
    '  gl_FragColor.xyz *= 1.0 - grad;',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.style.display = 'none'; return; }
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var u = {
    resolution: gl.getUniformLocation(prog, 'resolution'),
    time: gl.getUniformLocation(prog, 'time'),
    speed: gl.getUniformLocation(prog, 'speed'),
    shift: gl.getUniformLocation(prog, 'shift')
  };
  gl.uniform2f(u.speed, 0.7, 0.4);
  gl.uniform1f(u.shift, 1.6);

  // the effect is soft, half resolution is indistinguishable and much cheaper
  var SCALE = 0.5;
  function resize() {
    canvas.width = Math.max(1, Math.round(window.innerWidth * SCALE));
    canvas.height = Math.max(1, Math.round(window.innerHeight * SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.resolution, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var count = 0;
  function frame() {
    count += 0.01;
    gl.uniform1f(u.time, count);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!still) requestAnimationFrame(frame);
  }
  frame();
})();
