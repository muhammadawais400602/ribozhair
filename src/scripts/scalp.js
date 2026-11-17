import gsap from 'gsap';

const ENV = import.meta.glob('../assets/env/*.hdr', { eager: true, query: '?url', import: 'default' });

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = (t) => t * t * (3 - 2 * t);
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SLAB_W = 34, SLAB_D = 4, SLAB_H = 3.2, ZF = SLAB_D / 2;
const surfY = (x, z) =>
  0.11 * Math.sin(x * 0.9 + z * 0.7) + 0.07 * Math.sin(x * 1.7 - z * 1.3 + 1.3) + 0.035 * Math.sin(x * 3.1 + z * 2.7 + 0.4);

function canvasTex(THREE, w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export async function initScalp(canvas) {
  const noop = { setProgress() {}, destroy() {} };
  let THREE, renderer;
  try {
    THREE = await import('three');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    canvas.parentElement?.classList.add('is-fallback');
    return noop;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    const url = Object.values(ENV)[0];
    if (!url) throw new Error('no hdri');
    const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js');
    const hdr = await new HDRLoader().loadAsync(url);
    scene.environment = pmrem.fromEquirectangular(hdr).texture; hdr.dispose();
  } catch (e) {
    const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }
  scene.environmentIntensity = 0.9;
  scene.fog = new THREE.FogExp2(0xeaf3fc, 0.042);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

  // lights
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(-4, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 1.6); rim.position.set(5, 3, -5); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe4fa, 0.9));

  // ---------- textures ----------
  const noiseTex = canvasTex(THREE, 256, 256, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = 90 + Math.random() * 120; img.data.set([v, v, v, 255], i * 4); }
    ctx.putImageData(img, 0, 0);
    ctx.filter = 'blur(1.2px)'; ctx.drawImage(ctx.canvas, 0, 0);
  }, false);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.repeat.set(16, 24);

  const layerTex = canvasTex(THREE, 512, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.05, '#f1f7fe'); g.addColorStop(0.07, '#dcebfb');
    g.addColorStop(0.22, '#cfe4fa'); g.addColorStop(0.55, '#b4d5f7'); g.addColorStop(0.82, '#9cc8f4'); g.addColorStop(1, '#86bbf0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const y = Math.random() * h, x = Math.random() * w, l = 20 + Math.random() * 90;
      ctx.strokeStyle = `rgba(255,255,255,${0.06 + Math.random() * 0.14})`; ctx.lineWidth = 0.6 + Math.random();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + l * 0.3, y + 2, x + l * 0.7, y - 2, x + l, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 2500; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  });

  const haloTex = canvasTex(THREE, 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });

  const shadowTex = canvasTex(THREE, 256, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,6,20,0.55)'); g.addColorStop(1, 'rgba(0,6,20,0)');
    ctx.save(); ctx.scale(1, h / w); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); ctx.restore();
  });

  // ---------- slab ----------
  const slab = new THREE.Group(); scene.add(slab);

  const topGeo = new THREE.PlaneGeometry(36, 18, 300, 150);
  topGeo.rotateX(-Math.PI / 2); topGeo.translate(0, 0, -6);
  {
    const p = topGeo.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i); p.setY(i, surfY(x, z));
      const t = 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(x * 1.3 + z * 0.8) * Math.sin(z * 1.9 - x * 0.6 + 1.1)) - 0.06 * Math.sin(x * 5.3 + z * 4.1);
      col.set([0.9 + t * 0.08, 0.93 + t * 0.06, 0.97 + t * 0.03], i * 3);
    }
    topGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); topGeo.computeVertexNormals();
  }
  const topMat = new THREE.MeshPhysicalMaterial({
    color: 0xf3f8fe, roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.3,
    sheen: 0.6, sheenColor: new THREE.Color(0xcfe6ff), sheenRoughness: 0.5,
    bumpMap: noiseTex, bumpScale: 1.1, vertexColors: true, transparent: true, opacity: 0.97,
  });
  const top = new THREE.Mesh(topGeo, topMat); top.renderOrder = 3; slab.add(top);

  // cut face (follows surface profile)
  const NX = 200, NY = 28;
  const fp = [], fu = [], fi = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const x = -SLAB_W / 2 + (SLAB_W * i) / NX, ty = surfY(x, ZF);
    fp.push(x, ty + (-SLAB_H - ty) * (j / NY), ZF); fu.push(i / NX, 1 - j / NY);
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; fi.push(a, c, b, b, c, d);
  }
  const faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  faceGeo.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
  faceGeo.setIndex(fi); faceGeo.computeVertexNormals();
  const face = new THREE.Mesh(faceGeo, new THREE.MeshPhysicalMaterial({
    map: layerTex, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, transparent: true, opacity: 0.62, depthWrite: false,
  }));
  face.renderOrder = 6; slab.add(face);

  const wallMat = new THREE.MeshStandardMaterial({ map: layerTex, color: 0xf0f6fd, roughness: 0.7 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(SLAB_W, SLAB_H + 0.3), wallMat);
  back.position.set(0, -SLAB_H / 2 + 0.1, -ZF); back.renderOrder = 0; slab.add(back);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SLAB_W, SLAB_D), new THREE.MeshStandardMaterial({ color: 0xbcd8f5, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -SLAB_H; slab.add(floor);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(15, 7.5), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, fog: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -SLAB_H - 0.25, 0.4);

  // ---------- follicles ----------
  const R = rng(7);
  const profile = [[0.12, 0.06], [0.1, -0.3], [0.085, -0.9], [0.1, -1.35], [0.2, -1.62], [0.29, -1.86], [0.27, -2.05], [0.17, -2.2], [0.0, -2.25]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const follGeo = new THREE.LatheGeometry(profile, 32);
  const papGeo = new THREE.SphereGeometry(0.105, 24, 18);
  const mains = [];
  const mainSpots = [[-5.6, 0.7], [-4.5, 1.3], [-3.4, 0.4], [3.5, 0.6], [4.6, 1.25], [5.7, 0.5], [-2.3, 1.2], [-1.45, 0.3], [-0.55, 1.45], [0.35, 0.5], [1.15, 1.35], [1.9, 0.2], [2.45, 1.05]];
  mainSpots.forEach(([x, z], i) => {
    const s = 0.86 + R() * 0.28, y = surfY(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.set(s * (0.8 + R() * 0.45), s, s * (0.8 + R() * 0.45)); g.rotation.z = (R() - 0.5) * 0.12; slab.add(g);
    const bulbMat = new THREE.MeshPhysicalMaterial({
      color: 0xd9eafb, roughness: 0.3, clearcoat: 0.8, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      emissive: new THREE.Color(0x1e88e5), emissiveIntensity: 0.05, depthWrite: false,
    });
    const bulb = new THREE.Mesh(follGeo, bulbMat); bulb.renderOrder = 2; g.add(bulb);
    const papMat = new THREE.MeshStandardMaterial({ color: 0x5fb0f2, emissive: new THREE.Color(0x2f8fe8), emissiveIntensity: 0.15, roughness: 0.35 });
    const pap = new THREE.Mesh(papGeo, papMat); pap.position.set(0, -1.88, 0); pap.scale.set(1, 0.8, 1); pap.renderOrder = 2; g.add(pap);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0x2f9bff, transparent: true, depthWrite: false, opacity: 0.0, fog: false }));
    halo.position.set(x, y - 1.88 * s, z + 0.05); halo.renderOrder = 7; scene.add(halo);
    mains.push({ x, z, y, s, bulbMat, papMat, halo, papY: y - 1.88 * s });
  });

  // ---------- hair ----------
  const TUB = 64, RAD = 6;
  const hairMat = new THREE.MeshPhysicalMaterial({ color: 0x0b1426, roughness: 0.24, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.6, sheenColor: new THREE.Color(0x3d6db0) });
  const extraMat = hairMat.clone(); extraMat.transparent = true; extraMat.opacity = 0;
  const hairs = [];
  function addHair(x, z, rootY, L, radius, mat, extra, delay) {
    const sy = surfY(x, z), ox = (R() - 0.5) * 0.9, oz = (R() - 0.5) * 0.7;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, rootY, z), new THREE.Vector3(x + ox * 0.1, sy - 0.1, z),
      new THREE.Vector3(x + ox * 0.5, sy + L * 0.35, z + oz * 0.4), new THREE.Vector3(x + ox * 1.3, sy + L * 0.7, z + oz),
      new THREE.Vector3(x + ox * 2.3, sy + L, z + oz * 1.6),
    ]);
    const geo = new THREE.TubeGeometry(curve, TUB, radius, RAD, false);
    { const pos = geo.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i <= TUB; i++) { curve.getPointAt(i / TUB, c); const k = 1 - 0.6 * Math.pow(i / TUB, 1.4);
        for (let j = 0; j <= RAD; j++) { const n = i * (RAD + 1) + j; v.fromBufferAttribute(pos, n).sub(c).multiplyScalar(k).add(c); pos.setXYZ(n, v.x, v.y, v.z); } }
      geo.computeVertexNormals(); }
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 4; slab.add(mesh);
    const below = sy - rootY, stub = 0.3 + R() * 0.25;
    const f0 = extra ? 0 : clamp((below + stub) / (below + L), 0.2, 0.9);
    hairs.push({ mesh, f0, extra, delay });
    geo.setDrawRange(0, Math.floor(f0 * TUB) * RAD * 6);
  }
  mains.forEach((m) => addHair(m.x, m.z, m.y - 1.7 * m.s, 2.1 + R() * 0.7, 0.026, hairMat, false, R() * 0.6));
  for (let i = 0; i < 62; i++) {
    const x = (R() - 0.5) * 13, z = (R() - 0.5) * 3.6;
    addHair(x, z, surfY(x, z) - 0.12, 1.7 + R() * 1.1, 0.022, hairMat, false, R() * 0.6);
  }
  for (let i = 0; i < 40; i++) {
    const x = (R() - 0.5) * 13, z = (R() - 0.5) * 3.3;
    addHair(x, z, surfY(x, z) - 0.1, 1.3 + R() * 0.9, 0.015, extraMat, true, R() * 0.7);
  }

  // ---------- droplets ----------
  const DN = 420;
  const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xd6eaff, roughness: 0.03, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.72, envMapIntensity: 1.8 });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), dropMat, DN);
  drops.frustumCulled = false; drops.renderOrder = 5; slab.add(drops);
  const dd = [];
  for (let i = 0; i < DN; i++) {
    const ex = (R() - 0.5) * 13, ez = (R() - 0.5) * 3.6, r = 0.022 + R() * 0.03;
    dd.push({
      sx: ex * 0.55 - 3.6 + R() * 2.6, sy: 3.8 + R() * 1.4, sz: -1.2 + R() * 2.8,
      ex, ey: surfY(ex, ez) + r * 0.5, ez, r, delay: R() * 0.55, dur: 0.35 + R() * 0.15, abs: R() * 0.6, keep: R() < 0.25,
    });
  }
  const dummy = new THREE.Object3D();

  // ---------- 2dDR particles ----------
  const PN = 39;
  const partMat = new THREE.MeshBasicMaterial({ color: 0x1e88e5, toneMapped: false });
  const parts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 16, 12), partMat, PN);
  parts.frustumCulled = false; parts.renderOrder = 6; slab.add(parts);
  const pp = [];
  for (let i = 0; i < PN; i++) {
    const m = mains[i % mains.length], s = m.s, jx = (R() - 0.5) * 0.3;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(m.x + (R() - 0.5) * 0.9, m.y + 1.0 + R() * 0.5, m.z + (R() - 0.5) * 0.4),
      new THREE.Vector3(m.x + jx, m.y + 0.02, m.z),
      new THREE.Vector3(m.x - jx * 0.4, m.y - 0.8 * s, m.z + 0.02),
      new THREE.Vector3(m.x, m.papY, m.z),
    ]);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0x3da2ff, transparent: true, depthWrite: false, opacity: 0.9, fog: false }));
    spr.renderOrder = 8; slab.add(spr);
    pp.push({ curve, spr, delay: (i / PN) * 0.55, dur: 0.38 + R() * 0.1 });
  }

  // ---------- sizing / loop ----------
  let aspect = 1, baseDist = 11;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    aspect = w / h; camera.aspect = aspect;
    const t = Math.tan((camera.fov * Math.PI) / 360);
    baseDist = Math.max(3.0 / t, (aspect < 1 ? 1.55 : 3.3) / (t * aspect));
    if (aspect > 1.25) camera.setViewOffset(w, h, -w * 0.15, 0, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  let visible = true;
  const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0 });
  io.observe(canvas);

  let px = 0, py = 0, cpx = 0, cpy = 0;
  const onPointer = (e) => { px = (e.clientX / window.innerWidth) * 2 - 1; py = (e.clientY / window.innerHeight) * 2 - 1; };
  window.addEventListener('pointermove', onPointer, { passive: true });

  let target = 0, cur = 0, time = 0;

  function update(dt) {
    cur += (target - cur) * (1 - Math.exp(-dt * 6));
    time += dt;
    const p = cur;

    // droplets
    const sp = clamp(p / 0.33), q = clamp((p - 0.36) / 0.3);
    for (let i = 0; i < DN; i++) {
      const d = dd[i], u = clamp((sp * 1.1 - d.delay) / d.dur);
      if (u <= 0) { dummy.scale.setScalar(0); dummy.position.set(d.sx, d.sy, d.sz); }
      else {
        const e = u * u;
        dummy.position.set(d.sx + (d.ex - d.sx) * u, d.sy + (d.ey - d.sy) * e, d.sz + (d.ez - d.sz) * u);
        const land = smooth(0.85, 1, u), a = smooth(0, 1, clamp((q - d.abs) / 0.4));
        const fall = 1 - land, shrink = 1 - (d.keep ? 0.55 : 0.97) * a;
        dummy.scale.set(d.r * (1 + 0.5 * land) * shrink, d.r * (1 - 0.45 * land) * shrink * (1 + 0.6 * fall), d.r * (1 + 0.5 * land) * shrink);
      }
      dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;

    // 2dDR particles
    const pq = clamp((p - 0.33) / 0.33);
    for (let i = 0; i < PN; i++) {
      const o = pp[i], u = clamp((pq * 1.15 - o.delay) / o.dur);
      const vis = smooth(0, 0.12, u) * (1 - smooth(0.9, 1, u));
      const pos = o.curve.getPoint(easeInOut(u));
      dummy.position.copy(pos); dummy.scale.setScalar(vis); dummy.updateMatrix(); parts.setMatrixAt(i, dummy.matrix);
      o.spr.position.copy(pos); o.spr.scale.setScalar(0.55 * vis + 0.0001); o.spr.material.opacity = 0.85 * vis;
    }
    parts.instanceMatrix.needsUpdate = true;

    // follicle glow
    const glow = smooth(0.4, 0.68, p), settle = smooth(0.68, 1, p), pulse = 1 + 0.12 * Math.sin(time * 2.1) * settle;
    const g = (0.3 + glow * (1.6 - settle * 0.5)) * pulse;
    for (const m of mains) {
      const gl = clamp((g - 0.3) / 1.3);
      m.bulbMat.emissiveIntensity = 0.05 + gl * 0.55; m.papMat.emissiveIntensity = 0.15 + gl * 1.5;
      m.halo.material.opacity = 0.05 + gl * 0.4; m.halo.scale.setScalar(0.6 + gl * 0.6);
    }

    // hair growth
    for (const h of hairs) {
      const gr = smooth(0.66 + h.delay * 0.18, 0.98, p);
      const f = h.f0 + (1 - h.f0) * gr;
      h.mesh.geometry.setDrawRange(0, Math.floor(f * TUB) * RAD * 6);
      if (h.extra) h.mesh.visible = gr > 0.01;
    }
    extraMat.opacity = smooth(0.66, 0.85, p);

    // camera
    cpx += (px - cpx) * (1 - Math.exp(-dt * 3)); cpy += (py - cpy) * (1 - Math.exp(-dt * 3));
    const cx = Math.sin(p * 1.8) * 0.55 + cpx * 0.45;
    camera.position.set(cx, 4.0 + cpy * -0.3 - p * 0.3, baseDist - p * 1.2);
    camera.lookAt(cx * 0.35, -0.7, 0.5);
  }

  const tick = (_t, deltaTime) => {
    if (!visible) return;
    update(Math.min(deltaTime, 50) / 1000);
    renderer.render(scene, camera);
  };
  gsap.ticker.add(tick);
  update(0.016); renderer.render(scene, camera);

  return {
    setProgress(p, immediate = false) {
      target = clamp(p);
      if (immediate) cur = target;
    },
    destroy() {
      gsap.ticker.remove(tick); ro.disconnect(); io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      renderer.dispose();
    },
  };
}
