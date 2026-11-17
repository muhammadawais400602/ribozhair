import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const COLORS = { C: 0x9cc4f2, O: 0x2f9bff, H: 0xffffff };
const RADII = { C: 0.38, O: 0.36, H: 0.2 };

function buildAtoms() {
  const R = 1.15;
  const atoms = [];
  const bonds = [];
  const add = (el, x, y, z) => atoms.push({ el, p: [x, y, z] }) - 1;
  const bond = (a, b) => bonds.push([a, b]);
  const off = (i, r, ro, y, t = 0) => {
    const [x, py, z] = atoms[i].p;
    const th = atoms[i].th;
    const rx = Math.cos(th), rz = Math.sin(th);
    return [x + rx * ro - rz * t, py + y, z + rz * ro + rx * t];
  };

  const ring = [];
  for (let k = 0; k < 5; k++) {
    const th = Math.PI / 2 + (k * 2 * Math.PI) / 5;
    const i = add(k === 0 ? 'O' : 'C', R * Math.cos(th), 0, R * Math.sin(th));
    atoms[i].th = th;
    ring.push(i);
  }
  for (let k = 0; k < 5; k++) bond(ring[k], ring[(k + 1) % 5]);
  const [, c1, c2, c3, c4] = ring;

  const sub = (from, el, ro, y, t = 0, thFrom = from) => {
    const [x, py, z] = off(thFrom, 0, ro, y, t);
    const i = add(el, x, py, z);
    atoms[i].th = atoms[thFrom].th;
    bond(from, i);
    return i;
  };
  const subFrom = (from, el, ro, y, t = 0) => {
    const th = atoms[from].th;
    const [x, py, z] = atoms[from].p;
    const rx = Math.cos(th), rz = Math.sin(th);
    const i = add(el, x + rx * ro - rz * t, py + y, z + rz * ro + rx * t);
    atoms[i].th = th;
    bond(from, i);
    return i;
  };

  const o1 = sub(c1, 'O', 0.75, -0.95, 0.1);
  subFrom(o1, 'H', 0.5, -0.4, 0.2);
  subFrom(c2, 'H', 0.5, 0.8);
  subFrom(c2, 'H', 0.5, -0.8);
  const o3 = sub(c3, 'O', 0.75, 0.95, -0.1);
  subFrom(o3, 'H', 0.5, 0.45, -0.2);
  const c5 = sub(c4, 'C', 0.7, 0.95, 0.15);
  const o5 = subFrom(c5, 'O', 0.9, 0.55, 0.3);
  subFrom(o5, 'H', 0.5, 0.4, 0.2);

  const c = [0, 0, 0];
  atoms.forEach((a) => a.p.forEach((v, i) => (c[i] += v / atoms.length)));
  atoms.forEach((a) => (a.p = a.p.map((v, i) => v - c[i])));
  return { atoms, bonds };
}

export async function initMolecule(canvas, sectionEl) {
  const host = canvas.parentElement;
  let THREE, RoomEnvironment, renderer;
  try {
    THREE = await import('three');
    ({ RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js'));
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    host.classList.add('is-fallback');
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 6, 5);
  const rim = new THREE.PointLight(0x4aa8ff, 40, 30);
  rim.position.set(-5, -2, -4);
  scene.add(key, rim, new THREE.AmbientLight(0x6f9cff, 0.25));

  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  tilt.add(spin);
  scene.add(tilt);

  const { atoms, bonds } = buildAtoms();
  const mats = {};
  for (const el of Object.keys(COLORS)) {
    mats[el] = new THREE.MeshPhysicalMaterial({
      color: COLORS[el],
      roughness: 0.15,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.85,
      emissive: el === 'O' ? 0x0a5fd0 : el === 'C' ? 0x1a3c6e : 0x335577,
      emissiveIntensity: el === 'O' ? 0.35 : 0.12,
    });
  }
  const bondMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbeaff, roughness: 0.25, transparent: true, opacity: 0.7, clearcoat: 1, envMapIntensity: 1.1,
  });

  const sphereGeo = new THREE.SphereGeometry(1, 48, 32);
  const meshes = atoms.map((a) => {
    const m = new THREE.Mesh(sphereGeo, mats[a.el]);
    m.position.set(...a.p);
    m.userData.s = RADII[a.el];
    m.scale.setScalar(0.0001);
    spin.add(m);
    return m;
  });

  const up = new THREE.Vector3(0, 1, 0);
  const bondMeshes = bonds.map(([i, j]) => {
    const a = new THREE.Vector3(...atoms[i].p), b = new THREE.Vector3(...atoms[j].p);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, len, 20, 1, true), bondMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, dir.normalize());
    m.scale.set(0.0001, 1, 0.0001);
    spin.add(m);
    return m;
  });

  // Entrance
  let entered = false;
  const enter = () => {
    if (entered) return;
    entered = true;
    const tl = gsap.timeline();
    meshes.forEach((m, i) => {
      tl.to(m.scale, { x: m.userData.s, y: m.userData.s, z: m.userData.s, duration: 1.4, ease: 'expo.out' }, i * 0.06);
    });
    bondMeshes.forEach((m, i) => {
      tl.to(m.scale, { x: 1, z: 1, duration: 1.2, ease: 'expo.out' }, 0.25 + i * 0.05);
    });
  };
  const entranceST = ScrollTrigger.create({ trigger: sectionEl, start: 'top 30%', once: true, onEnter: enter });

  // Scroll-linked rotation
  const state = { p: 0 };
  const scrollST = ScrollTrigger.create({
    trigger: sectionEl, start: 'top bottom', end: 'bottom top', scrub: 1,
    onUpdate: (self) => (state.p = self.progress),
  });

  // Pointer parallax
  const target = { x: 0, y: 0 };
  const cur = { x: 0, y: 0 };
  const onMove = (e) => {
    target.y = (e.clientX / window.innerWidth - 0.5) * 0.36;
    target.x = (e.clientY / window.innerHeight - 0.5) * 0.28;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  // Sizing
  const resize = () => {
    const w = host.clientWidth || canvas.clientWidth || 1;
    const h = host.clientHeight || canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = 13 / Math.min(1, camera.aspect * 0.95 + 0.1);
    camera.position.set(0, 0.2, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // Visibility gating
  let visible = true;
  const io = new IntersectionObserver((es) => (visible = es[0].isIntersecting), { rootMargin: '100px' });
  io.observe(canvas);

  let idle = 0;
  const tick = (time, dt) => {
    if (!visible) return;
    const d = Math.min(dt, 50) / 1000;
    idle += d * 0.18;
    const k = 1 - Math.exp(-d * 4);
    cur.x += (target.x - cur.x) * k;
    cur.y += (target.y - cur.y) * k;
    spin.rotation.y = idle + state.p * Math.PI * 2;
    spin.rotation.x = 0.62 + Math.sin(idle * 0.7) * 0.1;
    tilt.rotation.x = cur.x;
    tilt.rotation.y = cur.y;
    tilt.position.y = Math.sin(time * 0.8) * 0.08;
    renderer.render(scene, camera);
  };
  gsap.ticker.add(tick);

  return () => {
    gsap.ticker.remove(tick);
    entranceST.kill();
    scrollST.kill();
    ro.disconnect();
    io.disconnect();
    window.removeEventListener('pointermove', onMove);
    renderer.dispose();
    pmrem.dispose();
  };
}
