import { gsap } from 'gsap';
import { sciState } from './sections-a.js';

const ENV = import.meta.glob('../assets/env/*.hdr', { eager: true, query: '?url', import: 'default' });
const BACK = import.meta.glob('../assets/bg/science-m.webp', { eager: true, query: '?url', import: 'default' });

const COLORS = { C: 0xeaf4ff, O: 0x4aa5f5, H: 0xffffff };
const RADII = { C: 0.4, O: 0.38, H: 0.21 };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const outExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -9 * clamp(t)));

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildAtoms() {
  const R = 1.15;
  const atoms = [];
  const bonds = [];
  const add = (el, x, y, z) => atoms.push({ el, p: [x, y, z] }) - 1;
  const bond = (a, b) => bonds.push([a, b]);

  const ring = [];
  for (let k = 0; k < 5; k++) {
    const th = Math.PI / 2 + (k * 2 * Math.PI) / 5;
    const i = add(k === 0 ? 'O' : 'C', R * Math.cos(th), 0, R * Math.sin(th));
    atoms[i].th = th;
    ring.push(i);
  }
  for (let k = 0; k < 5; k++) bond(ring[k], ring[(k + 1) % 5]);
  const [, c1, c2, c3, c4] = ring;

  const subFrom = (from, el, ro, y, t = 0) => {
    const th = atoms[from].th;
    const [x, py, z] = atoms[from].p;
    const rx = Math.cos(th), rz = Math.sin(th);
    const i = add(el, x + rx * ro - rz * t, py + y, z + rz * ro + rx * t);
    atoms[i].th = th;
    bond(from, i);
    return i;
  };

  const o1 = subFrom(c1, 'O', 0.75, -0.95, 0.1);
  subFrom(o1, 'H', 0.5, -0.4, 0.2);
  subFrom(c2, 'H', 0.5, 0.8);
  subFrom(c2, 'H', 0.5, -0.8);
  const o3 = subFrom(c3, 'O', 0.75, 0.95, -0.1);
  subFrom(o3, 'H', 0.5, 0.45, -0.2);
  const c5 = subFrom(c4, 'C', 0.7, 0.95, 0.15);
  const o5 = subFrom(c5, 'O', 0.9, 0.55, 0.3);
  subFrom(o5, 'H', 0.5, 0.4, 0.2);

  const c = [0, 0, 0];
  atoms.forEach((a) => a.p.forEach((v, i) => (c[i] += v / atoms.length)));
  atoms.forEach((a) => (a.p = a.p.map((v, i) => v - c[i])));
  return { atoms, bonds };
}

export async function initMolecule(canvas) {
  const host = canvas.parentElement;
  let THREE, renderer;
  try {
    THREE = await import('three');
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    host.classList.add('is-fallback');
    return;
  }
  const small = matchMedia('(max-width: 960px)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  // real studio HDRI so the beads pick up true soft-box reflections; procedural room as a fallback
  const envUrl = Object.entries(ENV).find(([k]) => k.endsWith('studio_1k.hdr'))?.[1] || Object.values(ENV)[0];
  const roomEnv = async () => {
    const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  };
  try {
    if (!envUrl) throw new Error('no hdri');
    const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js');
    const hdr = await new HDRLoader().loadAsync(envUrl);
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
  } catch (e) {
    await roomEnv();
  }

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(4, 6, 5);
  const rim = new THREE.PointLight(0x4aa8ff, 40, 30);
  rim.position.set(-5, -2, -4);
  const kick = new THREE.PointLight(0x9fd0ff, 22, 30);
  kick.position.set(5, -3, 3);
  scene.add(key, rim, kick, new THREE.AmbientLight(0x6f9cff, 0.2));

  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  tilt.add(spin);
  scene.add(tilt);

  const { atoms, bonds } = buildAtoms();
  // clear crystal: real transmission, refracting a soft copy of the section's own photo backdrop
  const mats = {};
  const glass = {
    C: { transmission: 1, thickness: 1.3, attenuationColor: 0x8fc4ff, attenuationDistance: 1.6 },
    O: { transmission: 0.92, thickness: 1.4, attenuationColor: 0x1e88e5, attenuationDistance: 0.55 },
    H: { transmission: 0.95, thickness: 0.7, attenuationColor: 0xcfe6ff, attenuationDistance: 2.5 },
  };
  for (const el of Object.keys(COLORS)) {
    mats[el] = new THREE.MeshPhysicalMaterial({
      color: COLORS[el], roughness: 0.04, metalness: 0, ior: 1.5,
      clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.35,
      iridescence: el === 'O' ? 0.35 : 0.2, iridescenceIOR: 1.3,
      specularIntensity: 1, ...glass[el],
    });
    mats[el].attenuationColor = new THREE.Color(glass[el].attenuationColor);
  }
  const bondMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4f9ff, roughness: 0.06, transmission: 1, thickness: 0.4, ior: 1.45, attenuationColor: new THREE.Color(0x9fd0ff), attenuationDistance: 1.2,
    clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.5,
  });

  // backdrop inside the canvas (edge-masked in CSS so it melts into the page photo) — gives the glass something to refract
  {
    const url = Object.values(BACK)[0];
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
    const cx = cv.getContext('2d');
    const paint = (img) => {
      cx.fillStyle = '#f2f7fd'; cx.fillRect(0, 0, 1024, 512);
      if (img) { cx.globalAlpha = 0.5; cx.drawImage(img, 0, 0, 1024, 512); cx.globalAlpha = 1; }
      const g = cx.createRadialGradient(560, 256, 40, 560, 256, 520);
      g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.5, 'rgba(214,234,253,0.45)'); g.addColorStop(1, 'rgba(160,205,250,0.5)');
      cx.fillStyle = g; cx.fillRect(0, 0, 1024, 512);
    };
    paint(null);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(90, 45), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }));
    back.position.z = -22; scene.add(back);
    if (url) { const img = new Image(); img.onload = () => { paint(img); tex.needsUpdate = true; }; img.src = url; }
  }

  // soft additive glow (reads as bloom / shallow depth of field)
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 128;
  {
    const ctx = haloCanvas.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(0.6, 'rgba(255,255,255,0.13)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  }
  const haloTex = new THREE.CanvasTexture(haloCanvas);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  const haloMat = (opacity, color = 0x3d9bf2) => new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, depthWrite: false, opacity, toneMapped: false });

  const R = rng(19);
  const sphereGeo = new THREE.SphereGeometry(1, 64, 48);
  const N = atoms.length;
  const nodes = atoms.map((a, i) => {
    const m = new THREE.Mesh(sphereGeo, mats[a.el]);
    const home = new THREE.Vector3(...a.p);
    // scattered start: far out on a shell, spread in depth so they drift in from "out of focus"
    const th = R() * Math.PI * 2, ph = Math.acos(R() * 2 - 1), rad = 6.5 + R() * 5;
    const from = new THREE.Vector3(Math.sin(ph) * Math.cos(th) * rad, Math.cos(ph) * rad * 0.8, Math.sin(ph) * Math.sin(th) * rad);
    const order = a.el === 'H' ? 0.45 + R() * 0.3 : (i / N) * 0.5;
    let halo = null;
    if (a.el === 'O') { halo = new THREE.Sprite(haloMat(0)); halo.scale.setScalar(2.6); halo.renderOrder = -1; spin.add(halo); }
    spin.add(m);
    return { m, home, from, order, s: RADII[a.el], halo, wob: R() * 6.28 };
  });

  const up = new THREE.Vector3(0, 1, 0);
  const bondNodes = bonds.map(([i, j], k) => {
    const a = nodes[i].home, b = nodes[j].home;
    const dir = b.clone().sub(a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 24, 1, true), bondMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, dir.normalize());
    m.scale.set(0.0001, 0.0001, 0.0001);
    spin.add(m);
    return { m, order: k / bonds.length };
  });

  const core = new THREE.Sprite(haloMat(0, 0xffffff));
  core.scale.setScalar(9); core.renderOrder = -2; tilt.add(core);

  // out-of-focus particles floating in front of / behind the molecule
  const dust = new THREE.Group(); scene.add(dust);
  const motes = [];
  for (let i = 0; i < (small ? 26 : 54); i++) {
    const s = new THREE.Sprite(haloMat(0.06 + R() * 0.2, R() > 0.5 ? 0x64b5f6 : 0x1e88e5));
    const far = R();
    s.position.set((R() - 0.5) * 22, (R() - 0.5) * 12, -8 + far * 14);
    s.scale.setScalar(0.12 + Math.pow(R(), 2) * (far > 0.7 ? 1.5 : 0.6));
    s.userData = { y: s.position.y, sp: 0.15 + R() * 0.4, ph: R() * 6.28, o: s.material.opacity };
    dust.add(s); motes.push(s);
  }

  // Pointer parallax
  const target = { x: 0, y: 0 };
  const cur = { x: 0, y: 0 };
  const onMove = (e) => {
    target.y = (e.clientX / window.innerWidth - 0.5) * 0.4;
    target.x = (e.clientY / window.innerHeight - 0.5) * 0.3;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  // Sizing
  let wide = true;
  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    wide = !matchMedia('(max-width: 960px)').matches;
    const fit = 3.5 / Math.tan((camera.fov * Math.PI) / 360);
    const dist = fit / Math.min(1, camera.aspect * (wide ? 0.82 : 0.95));
    camera.position.set(0, 0.15, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    tilt.position.x = wide ? Math.min(1.1, camera.aspect * 0.5) : 0;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // Visibility gating
  let visible = true;
  const io = new IntersectionObserver((es) => (visible = es[0].isIntersecting), { rootMargin: '120px' });
  io.observe(canvas);

  const v = new THREE.Vector3();
  let idle = 0, a = 0, time = 0;
  const tick = (_t, dt) => {
    if (!visible) return;
    const d = Math.min(dt, 50) / 1000;
    time += d;
    idle += d * 0.16;
    // assembly progress: a little as the stage arrives, the rest while it is pinned
    const goal = clamp(sciState.enter * 0.22 + clamp(sciState.pin / 0.72) * 0.78);
    a += (goal - a) * (1 - Math.exp(-d * 5));

    for (const n of nodes) {
      const t = clamp((a * 1.5 - n.order) / 0.72);
      const e = outExpo(t);
      v.copy(n.from).lerp(n.home, e);
      // gentle weightless drift while still apart
      const loose = 1 - e;
      v.x += Math.sin(time * 0.6 + n.wob) * 0.35 * loose;
      v.y += Math.cos(time * 0.5 + n.wob * 1.3) * 0.35 * loose;
      n.m.position.copy(v);
      n.m.scale.setScalar(Math.max(0.0001, n.s * (0.35 + 0.65 * e) * smooth(a * 6 - n.order * 2)));
      if (n.halo) { n.halo.position.copy(v); n.halo.material.opacity = 0.3 * e * (0.85 + 0.15 * Math.sin(time * 1.7 + n.wob)); }
    }
    for (const b of bondNodes) {
      const t = smooth((a - 0.62 - b.order * 0.16) / 0.2);
      b.m.scale.set(Math.max(0.0001, t), Math.max(0.0001, t), Math.max(0.0001, t));
    }
    core.material.opacity = 0.35 + 0.4 * smooth((a - 0.5) / 0.5);

    const k = 1 - Math.exp(-d * 4);
    cur.x += (target.x - cur.x) * k;
    cur.y += (target.y - cur.y) * k;
    spin.rotation.y = idle + a * Math.PI * 1.4 + sciState.pin * Math.PI * 0.6;
    spin.rotation.x = 0.62 + Math.sin(idle * 0.7) * 0.1;
    tilt.rotation.x = cur.x;
    tilt.rotation.y = cur.y;
    tilt.position.y = Math.sin(time * 0.8) * 0.08;
    const zoom = 0.86 + 0.14 * smooth(a);
    tilt.scale.setScalar(zoom);

    for (const s of motes) {
      s.position.y = s.userData.y + Math.sin(time * s.userData.sp + s.userData.ph) * 0.5;
      s.material.opacity = s.userData.o * (0.6 + 0.4 * Math.sin(time * s.userData.sp * 1.7 + s.userData.ph));
    }
    dust.rotation.y = cur.y * 0.5 + Math.sin(time * 0.05) * 0.1;
    dust.position.x = -cur.y * 1.2;

    renderer.render(scene, camera);
  };
  gsap.ticker.add(tick);

  return () => {
    gsap.ticker.remove(tick);
    ro.disconnect();
    io.disconnect();
    window.removeEventListener('pointermove', onMove);
    renderer.dispose();
    pmrem.dispose();
  };
}
