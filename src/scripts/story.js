import "../styles/story.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Delaunay } from "d3-delaunay";

// Assets are resolved by glob so a missing photo/HDRI degrades instead of breaking the build
const BG = import.meta.glob("../assets/bg/*.webp", { eager: true, query: "?url", import: "default" });
const ENV = import.meta.glob("../assets/env/*.hdr", { eager: true, query: "?url", import: "default" });
const pick = (map, name) => { const k = Object.keys(map).find((p) => p.endsWith("/" + name)); return k ? map[k] : null; };

const VH = 10; // world units visible vertically at z = 0
const FOV = 22;
const DIST = VH / 2 / Math.tan((FOV * Math.PI) / 360);
const R = 0.72; // competitor body radius
const SHELL_H = 3.5;
const BODY_Y = -2.3; // bottle pivot offset
const THICK = 0.05;
const PROFILE = [[0.1, 0.016], [0.5, 0], [0.66, 0.03], [0.72, 0.15], [0.72, 0.8], [0.72, 1.6], [0.72, 2.38], [0.705, 2.58], [0.62, 2.79], [0.45, 2.96], [0.31, 3.07], [0.27, 3.2], [0.27, 3.5]];
const LABEL = { x0: -1.2 * R, x1: 1.2 * R, y0: 0.62, y1: 2.08 };

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (t) => t * t * (3 - 2 * t);
const outQuart = (t) => 1 - Math.pow(1 - t, 4);
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

function loadImage(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

// half-width of the real bottle photo per height (0 = base, 1 = top), from its alpha channel
function silhouetteOf(img) {
  const N = 96, out = new Float32Array(N).fill(0.9);
  if (!img) return out;
  try {
    const w = 96, h = N, c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) {
      let a = w, b = -1;
      for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 60) { if (x < a) a = x; b = x; }
      out[h - 1 - y] = b < 0 ? 0.2 : Math.max(0.16, (b - a + 1) / w);
    }
  } catch (e) { /* tainted canvas: keep the default cylinder */ }
  return out;
}

export async function initStory() {
  const story = document.querySelector(".story");
  const stage = story.querySelector(".story__stage");
  const canvas = story.querySelector(".story__gl");
  const darkBg = story.querySelector(".story__bg--dark");
  const blueBg = story.querySelector(".story__bg--blue");
  const meetBottle = story.querySelector("[data-meet-bottle]");
  const bottleImg = meetBottle.querySelector("img");
  const liquid = meetBottle.querySelector(".liquid");
  const shadow = meetBottle.querySelector(".meet__shadow");
  const bloom = meetBottle.querySelector(".meet__bloom");
  const heading = story.querySelector(".problem__heading");
  const stmts = [...story.querySelectorAll("[data-stmt]")];
  const tagline = story.querySelector(".meet__tagline");
  const intro = story.querySelector(".meet__intro");
  const badges = [...story.querySelectorAll(".badges .glass-badge")];

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lite = matchMedia("(pointer: coarse)").matches || innerWidth < 820 || (navigator.deviceMemory || 8) <= 2;
  const small = innerWidth <= 820;
  const urls = {
    problem: pick(BG, small ? "problem-m.webp" : "problem.webp") || pick(BG, "problem.webp"),
    meet: pick(BG, small ? "meet-m.webp" : "meet.webp") || pick(BG, "meet.webp"),
    env: pick(ENV, "studio_1k.hdr") || Object.values(ENV)[0] || null,
  };
  if (urls.problem) darkBg.style.backgroundImage = `url("${urls.problem}")`;
  if (urls.meet) blueBg.style.backgroundImage = `url("${urls.meet}")`;

  if (!(bottleImg.complete && bottleImg.naturalWidth)) await new Promise((r) => { bottleImg.addEventListener("load", r, { once: true }); bottleImg.addEventListener("error", r, { once: true }); });
  const bottleAR = bottleImg.naturalWidth ? bottleImg.naturalWidth / bottleImg.naturalHeight : 0.305;
  meetBottle.style.setProperty("--bottle-ar", bottleAR);
  const maskUrl = `url("${bottleImg.currentSrc || bottleImg.src}")`;
  liquid.style.webkitMaskImage = maskUrl; liquid.style.maskImage = maskUrl;

  // scrubbed parameters — the whole 3D scene is a pure function of these
  const P = { fall: 0, crack: 0, burst: 0, flash: 0, drift: 0, bg: 0, asm: 0, sweep: 0, fade: 0 };
  let gl = null;
  try { gl = await buildScene(); } catch (e) { console.warn("[story] WebGL unavailable, using photo fallback", e); }
  if (!gl) canvas.style.display = "none";

  gsap.set([heading, ...stmts, tagline, intro, ...badges, bottleImg, liquid], { autoAlpha: 0 });
  const DROP = "drop-shadow(0px 34px 30px rgba(2,10,30,0.45))";

  // ---- ONE master timeline across Section 3 + Section 4 ----
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: story, start: "top top", end: "+=720%", pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true,
      onRefresh: () => gl && gl.layout(),
    },
  });
  // 3 · the competitor bottle falls in, cracks, shatters
  tl.to(P, { fall: 1, duration: 1.5, ease: "power2.in" }, 0);
  tl.to(P, { crack: 1, duration: 0.2, ease: "power1.out" }, 1.5);
  tl.to(P, { flash: 1, duration: 0.07 }, 1.66).to(P, { flash: 0, duration: 0.55, ease: "power2.out" }, 1.73);
  tl.to(P, { burst: 1, duration: 2.7 }, 1.68);
  tl.to(P, { drift: 1, duration: 5.2 }, 2.3);
  tl.fromTo(heading, { autoAlpha: 0, y: 44, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.1, ease: "power3.out" }, 2.9);
  tl.fromTo(stmts, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.2 }, 3.3);
  tl.to([heading, ...stmts], { autoAlpha: 0, y: -28, duration: 0.8, ease: "power2.in", stagger: 0.04 }, 6.2);
  tl.to(P, { bg: 1, duration: 2.1, ease: "power1.inOut" }, 6.5);
  tl.to(blueBg, { opacity: 1, duration: 2.1, ease: "power1.inOut" }, 6.5);
  // 4 · the same shards fly inward and assemble into the RibozHair bottle
  tl.to(P, { asm: 1, duration: 2.5 }, 7.1);
  tl.to(P, { sweep: 1, duration: 1.2, ease: "power1.inOut" }, 9.0);
  tl.fromTo(bottleImg, { autoAlpha: 0, filter: `blur(12px) ${DROP}` }, { autoAlpha: 1, filter: `blur(0px) ${DROP}`, duration: 1.0, ease: "power2.out" }, gl ? 9.6 : 7.4);
  tl.to(P, { fade: 1, duration: 0.9, ease: "power1.in" }, 9.8);
  tl.fromTo(shadow, { opacity: 0, scaleX: 0.6 }, { opacity: 1, scaleX: 1, duration: 1.0, ease: "power2.out" }, 9.9);
  tl.to(liquid, { autoAlpha: 0.42, duration: 1.0, ease: "power1.out" }, 10.4);
  tl.fromTo(tagline, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out" }, 10.4);
  tl.fromTo(intro, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out" }, 10.65);
  tl.fromTo(badges, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.14 }, 10.9);
  tl.to({}, { duration: 1.0 }, 11.8);

  // ---- liquid: two sine surfaces sloshing inside the bottle ----
  const A = liquid.querySelector(".liquid__a");
  const B = liquid.querySelector(".liquid__b");
  const shine = liquid.querySelector(".liquid__shine");
  const lsvg = liquid.querySelector("svg");
  const st = { p: 0 };
  function wave(path, level, amp, k, ph) {
    let d = `M-10 ${level + amp * Math.sin(k * -10 + ph)}`;
    for (let x = 0; x <= 210; x += 6) d += ` L${x} ${(level + amp * Math.sin(k * x + ph)).toFixed(2)}`;
    path.setAttribute("d", d + " L210 480 L-10 480Z");
  }
  function paint() {
    wave(A, 176, 5.5, 0.052, st.p);
    wave(B, 184, 4.2, 0.07, -st.p * 1.3 + 1.2);
    gsap.set(shine, { x: Math.sin(st.p * 0.5) * 16 });
  }
  paint();
  const waveTween = gsap.to(st, { p: Math.PI * 2, duration: 5.5, ease: "none", repeat: -1, onUpdate: paint, paused: true });
  const sloshTween = gsap.fromTo(lsvg, { rotation: -1.8, transformOrigin: "50% 80%" }, { rotation: 1.8, duration: 3.1, ease: "sine.inOut", yoyo: true, repeat: -1, paused: true });

  // render + ambient loops only run while the section is on screen
  ScrollTrigger.create({
    trigger: story.parentNode && story.parentNode.classList.contains("pin-spacer") ? story.parentNode : story, start: "top bottom", end: "bottom top",
    onToggle: (self) => {
      if (self.isActive) { if (!reduced) { waveTween.resume(); sloshTween.resume(); } gl && gl.start(); }
      else { waveTween.pause(); sloshTween.pause(); gl && gl.stop(); }
    },
  });
  if (gl) { addEventListener("resize", () => gl.layout()); gl.layout(); gl.frame(); }
  if (import.meta.env.DEV) window.__story = { tl, P, gl };

  /* ======================================================================== */
  async function buildScene() {
    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return null;
    const THREE = await import("three");
    const { Vector3: V3, Quaternion: Q4, Matrix4: M4 } = THREE;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lite ? 1.5 : 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x050d1f, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 80);
    camera.position.set(0, 0, DIST);

    // ---- environment: studio HDRI (falls back to a procedural room) ----
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envOK = false;
    if (urls.env) {
      try {
        const { HDRLoader } = await import("three/examples/jsm/loaders/HDRLoader.js");
        const hdr = await new HDRLoader().loadAsync(urls.env);
        scene.environment = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose(); envOK = true;
      } catch (e) { /* fall through */ }
    }
    if (!envOK) {
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    }
    pmrem.dispose();
    scene.environmentIntensity = 1;

    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-4, 7, 9); scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fc4ff, 2.2); rim.position.set(6, 3, -6); scene.add(rim);
    const sweepLight = new THREE.PointLight(0xffffff, 0, 30, 1.6); scene.add(sweepLight);

    // ---- cinematic photo backdrop (lives in the scene so the glass refracts it) ----
    const texLoader = new THREE.TextureLoader();
    function gradientTex(stops) {
      const c = document.createElement("canvas"); c.width = 64; c.height = 256;
      const g = c.getContext("2d"), lg = g.createLinearGradient(0, 0, 0, 256);
      stops.forEach(([o, col]) => lg.addColorStop(o, col)); g.fillStyle = lg; g.fillRect(0, 0, 64, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    async function photo(url, stops) {
      let t = null;
      if (url) { try { t = await texLoader.loadAsync(url); } catch (e) { t = null; } }
      if (!t) return { tex: gradientTex(stops), ar: 16 / 9 };
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      return { tex: t, ar: t.image.width / t.image.height };
    }
    const [pA, pB] = await Promise.all([
      photo(urls.problem, [[0, "#0a1830"], [0.5, "#0b1f3f"], [0.56, "#081428"], [1, "#030a18"]]),
      photo(urls.meet, [[0, "#0d4d9c"], [0.6, "#1e88e5"], [1, "#6fbcf7"]]),
    ]);
    const bgMat = new THREE.ShaderMaterial({
      depthWrite: false,
      uniforms: {
        tA: { value: pA.tex }, tB: { value: pB.tex }, uArA: { value: pA.ar }, uArB: { value: pB.ar }, uPlaneAr: { value: 1 },
        uMix: { value: 0 }, uZoom: { value: 1 }, uShift: { value: new THREE.Vector2() }, uFlash: { value: 0 }, uDim: { value: 0 },
      },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
        uniform sampler2D tA, tB; uniform float uArA, uArB, uPlaneAr, uMix, uZoom, uFlash, uDim; uniform vec2 uShift; varying vec2 vUv;
        vec2 cover(vec2 uv, float ar, float zoom, vec2 shift){
          vec2 s = uPlaneAr > ar ? vec2(1.0, ar / uPlaneAr) : vec2(uPlaneAr / ar, 1.0);
          return (uv - 0.5) * s / zoom + 0.5 + shift;
        }
        void main(){
          vec3 a = texture2D(tA, cover(vUv, uArA, uZoom, uShift)).rgb;
          vec3 b = texture2D(tB, cover(vUv, uArB, uZoom * 0.97 + 0.06, -uShift)).rgb;
          vec3 col = mix(a, b, smoothstep(0.0, 1.0, uMix));
          vec2 q = vUv - 0.5;
          col *= 1.0 - uDim * smoothstep(0.75, 0.0, length(q * vec2(1.0, 1.6)));
          col += uFlash * vec3(0.22, 0.27, 0.34) * smoothstep(0.5, 0.0, length(q * vec2(1.0, 1.4)));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const BG_Z = -12;
    const bgPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bgMat);
    bgPlane.position.z = BG_Z; bgPlane.renderOrder = -10; scene.add(bgPlane);

    // ---- competitor bottle profile ----
    const curve = new THREE.CatmullRomCurve3(PROFILE.map(([r, y]) => new V3(r, y, 0)), false, "centripetal");
    const NP = 220, S = curve.getLength(), pts = curve.getSpacedPoints(NP);
    function prof(s) {
      const f = clamp01(s / S) * NP, i = Math.min(NP - 1, Math.floor(f)), t = f - i;
      const a = pts[i], b = pts[i + 1], i0 = Math.max(0, i - 1), i1 = Math.min(NP, i + 2);
      let tr = pts[i1].x - pts[i0].x, ty = pts[i1].y - pts[i0].y; const l = Math.hypot(tr, ty) || 1; tr /= l; ty /= l;
      return { r: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), nr: ty, ny: -tr };
    }
    const sAtY = (y) => { for (let i = 30; i <= NP; i++) if (pts[i].y >= y) return (i / NP) * S; return S; };
    const silC = (y) => (y < 0.15 ? R : prof(sAtY(y)).r);
    const C = 2 * Math.PI * R;
    const surf = (x, s, off, out, nOut) => {
      const p = prof(s), th = x / R, sn = Math.sin(th), cs = Math.cos(th), r = p.r + p.nr * off;
      out.set(r * sn, p.y + p.ny * off, r * cs);
      if (nOut) nOut.set(p.nr * sn, p.ny, p.nr * cs);
      return out;
    };

    // ---- materials ----
    const glassOpts = lite
      ? { color: 0xe4f3ff, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.42, envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false }
      : { color: 0xffffff, roughness: 0.035, metalness: 0, transmission: 1, ior: 1.5, thickness: 0.22, attenuationColor: new THREE.Color("#bfeadd"), attenuationDistance: 0.9, dispersion: 2.5, envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, transparent: true };
    const shardMat = new THREE.MeshPhysicalMaterial({ ...glassOpts, vertexColors: true });
    const bottleMat = new THREE.MeshPhysicalMaterial(lite
      ? { color: 0xcfe6f2, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.5, envMapIntensity: 2.2, clearcoat: 1 }
      : { color: 0xffffff, roughness: 0.04, metalness: 0, transmission: 1, ior: 1.46, thickness: 0.9, attenuationColor: new THREE.Color("#a9d8e6"), attenuationDistance: 1.6, envMapIntensity: 1.4, clearcoat: 1, clearcoatRoughness: 0.04 });
    const labelMat = new THREE.MeshStandardMaterial({ color: 0xf1f2f0, roughness: 0.72, metalness: 0, transparent: true, side: THREE.DoubleSide });
    const blackMat = new THREE.MeshPhysicalMaterial({ color: 0x08090c, roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3 });
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.35 });
    const dustMat = new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.03, metalness: 0.55, envMapIntensity: 3, transparent: true, opacity: 0.85, clearcoat: 1 });
    const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f9ff, roughness: 0.02, metalness: 0.2, transparent: true, opacity: 0.6, envMapIntensity: 3, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false });

    // ---- rig ----
    const rig = new THREE.Group(); scene.add(rig);
    const body = new THREE.Group(); body.position.y = BODY_Y; rig.add(body);

    const lathePts = []; for (let i = 0; i <= NP; i += 2) lathePts.push(new THREE.Vector2(pts[i].x, pts[i].y));
    const intact = new THREE.Mesh(new THREE.LatheGeometry(lathePts, lite ? 48 : 80), bottleMat);
    body.add(intact);

    // pump (black, glossy) + dip tube: rigid pieces that fly off at impact
    const pump = new THREE.Group(); body.add(pump);
    const pumpPivot = new V3(0, 3.95, 0); pump.position.copy(pumpPivot);
    const cyl = (r0, r1, h, y, mat = blackMat, seg = 40) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); m.position.y = y - pumpPivot.y + h / 2; pump.add(m); return m; };
    cyl(0.335, 0.345, 0.36, 3.36); cyl(0.3, 0.335, 0.07, 3.72); cyl(0.2, 0.22, 0.12, 3.79); cyl(0.105, 0.105, 0.3, 3.91); cyl(0.235, 0.245, 0.3, 4.21); cyl(0.2, 0.235, 0.06, 4.51);
    const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.15), blackMat); nozzle.position.set(0.3, 4.38 - pumpPivot.y, 0); pump.add(nozzle);
    cyl(0.03, 0.03, 3.05, 0.3, tubeMat, 12);

    // ---- fracture: Voronoi cells in the shell's (arc, height) surface space, dense around the impact ----
    const rand = rng(7);
    const imp = { x: 0.18, s: sAtY(0.98) };
    const sites = [[imp.x, imp.s]];
    const rings = lite ? [[0.14, 5], [0.32, 7], [0.66, 8], [1.2, 9], [2.0, 9]] : [[0.085, 5], [0.175, 7], [0.31, 9], [0.53, 11], [0.86, 12], [1.3, 13], [1.9, 13], [2.7, 12]];
    rings.forEach(([rho, n]) => {
      const a0 = rand() * 6.283;
      for (let j = 0; j < n; j++) {
        const a = a0 + ((j + (rand() - 0.5) * 0.7) / n) * 6.283, rr = rho * (0.8 + rand() * 0.4);
        const x = imp.x + Math.cos(a) * rr, s = imp.s + Math.sin(a) * rr;
        if (s > 0.05 && s < S - 0.05 && Math.abs(x) < C / 2 - 0.05) sites.push([x, s]);
      }
    });
    const dmin = lite ? 0.7 : 0.52, cap = lite ? 46 : 104;
    for (let tries = 0; tries < 1400 && sites.length < cap; tries++) {
      const x = (rand() - 0.5) * C, s = rand() * S;
      if (sites.every((p) => { let dx = Math.abs(p[0] - x); dx = Math.min(dx, C - dx); return Math.hypot(dx, p[1] - s) > dmin; })) sites.push([x, s]);
    }
    const nSites = sites.length;
    const all = sites.concat(sites.map(([x, s]) => [x - C, s]), sites.map(([x, s]) => [x + C, s]));
    const voronoi = Delaunay.from(all).voronoi([-C * 1.5, 0, C * 1.5, S]);

    const wrapX = (x) => { let m = ((x % C) + C) % C; return Math.round(m * 500) / 500; };
    // subdivide + jitter each edge canonically so neighbouring shards share the same ragged crack
    function ragged(poly) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        out.push(a);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.ceil(len / 0.13));
        const fwd = wrapX(a[0]) < wrapX(b[0]) || (wrapX(a[0]) === wrapX(b[0]) && a[1] < b[1]);
        const p0 = fwd ? a : b, p1 = fwd ? b : a, hx = wrapX(p0[0]) + wrapX(p1[0]) * 3.1, hy = p0[1] + p1[1] * 2.3;
        const px = -(p1[1] - p0[1]) / (len || 1), py = (p1[0] - p0[0]) / (len || 1), amp = Math.min(0.03, len * 0.11);
        for (let j = 1; j < n; j++) {
          const jj = fwd ? j : n - j, t = jj / n, w = (hash(hx, hy, jj) - 0.5) * 2 * amp * Math.sin(Math.PI * t);
          const edgeLock = (p0[1] < 1e-4 && p1[1] < 1e-4) || (p0[1] > S - 1e-4 && p1[1] > S - 1e-4) ? 0 : 1;
          out.push([lerp(p0[0], p1[0], t) + px * w * edgeLock, Math.min(S, Math.max(0, lerp(p0[1], p1[1], t) + py * w * edgeLock))]);
        }
      }
      return out;
    }
    function centroidOf(poly) {
      let a = 0, cx = 0, cy = 0;
      for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], c = p[0] * q[1] - q[0] * p[1]; a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; }
      return Math.abs(a) < 1e-9 ? [poly[0][0], poly[0][1], 0] : [cx / (3 * a), cy / (3 * a), a / 2];
    }
    function clipRect(poly, r) {
      const edges = [[(p) => p[0] >= r.x0, (a, b) => { const t = (r.x0 - a[0]) / (b[0] - a[0]); return [r.x0, lerp(a[1], b[1], t)]; }], [(p) => p[0] <= r.x1, (a, b) => { const t = (r.x1 - a[0]) / (b[0] - a[0]); return [r.x1, lerp(a[1], b[1], t)]; }], [(p) => p[1] >= r.s0, (a, b) => { const t = (r.s0 - a[1]) / (b[1] - a[1]); return [lerp(a[0], b[0], t), r.s0]; }], [(p) => p[1] <= r.s1, (a, b) => { const t = (r.s1 - a[1]) / (b[1] - a[1]); return [lerp(a[0], b[0], t), r.s1]; }]];
      let out = poly;
      for (const [inside, cut] of edges) {
        const inp = out; out = [];
        for (let i = 0; i < inp.length; i++) { const a = inp[i], b = inp[(i + 1) % inp.length], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(cut(a, b)); }
        if (out.length < 3) return null;
      }
      return out;
    }
    const tmpA = new V3(), tmpN = new V3(), tmpB = new V3();
    // tessellate a surface-space polygon as concentric rings so big shards follow the bottle's curvature
    function facePatch(fn, poly, c, off, origin, pos, nrm, col, tint, bevel, flip) {
      const dense = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1));
        for (let j = 0; j < n; j++) dense.push([lerp(a[0], b[0], j / n), lerp(a[1], b[1], j / n)]);
      }
      poly = dense;
      let maxR = 0; poly.forEach((p) => { maxR = Math.max(maxR, Math.hypot(p[0] - c[0], p[1] - c[1])); });
      const K = Math.max(1, Math.min(7, Math.ceil(maxR / 0.11))), m = poly.length;
      const P = (k, j) => { const p = poly[j % m], t = k / K; return [lerp(c[0], p[0], t), lerp(c[1], p[1], t)]; };
      const push = (uv, edge) => {
        fn(uv[0], uv[1], off, tmpA, tmpN);
        if (edge && bevel) { fn(c[0], c[1], off, tmpB); tmpB.subVectors(tmpA, tmpB).normalize(); tmpN.addScaledVector(tmpB, bevel).normalize(); }
        if (flip) tmpN.negate();
        pos.push(tmpA.x - origin.x, tmpA.y - origin.y, tmpA.z - origin.z); nrm.push(tmpN.x, tmpN.y, tmpN.z); if (col) col.push(tint[0], tint[1], tint[2]);
      };
      const tri = (a, ae, b, be, d, de) => { if (flip) { push(a, ae); push(d, de); push(b, be); } else { push(a, ae); push(b, be); push(d, de); } };
      for (let j = 0; j < m; j++) {
        tri(c, false, P(1, j), K === 1, P(1, j + 1), K === 1);
        for (let k = 1; k < K; k++) {
          const e = k + 1 === K;
          tri(P(k, j), false, P(k + 1, j), e, P(k + 1, j + 1), e);
          tri(P(k, j), false, P(k + 1, j + 1), e, P(k, j + 1), false);
        }
      }
    }

    const WHITE = [1, 1, 1], EDGE = [0.74, 0.97, 0.9];
    const a3 = new V3(), b3 = new V3(), c3 = new V3(), d3 = new V3(), n3 = new V3();
    // one closed glass piece: outer face, inner face, side walls — on any surface function
    function solid(fn, rag, c, pos, nrm, col) {
      const origin = fn(c[0], c[1], -THICK / 2, new V3());
      facePatch(fn, rag, c, 0, origin, pos, nrm, col, WHITE, 0.5, false);
      facePatch(fn, rag, c, -THICK, origin, pos, nrm, col, WHITE, 0.3, true);
      for (let j = 0; j < rag.length; j++) {
        const p = rag[j], q = rag[(j + 1) % rag.length];
        fn(p[0], p[1], 0, a3); fn(q[0], q[1], 0, b3); fn(q[0], q[1], -THICK, c3); fn(p[0], p[1], -THICK, d3);
        n3.subVectors(b3, a3).cross(tmpA.subVectors(d3, a3)).normalize().negate();
        for (const v of [a3, d3, b3, b3, d3, c3]) { pos.push(v.x - origin.x, v.y - origin.y, v.z - origin.z); nrm.push(n3.x, n3.y, n3.z); if (col) col.push(EDGE[0], EDGE[1], EDGE[2]); }
      }
      return origin;
    }
    const morphable = (pos, nrm, col) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
      if (col) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.morphAttributes.position = [new THREE.Float32BufferAttribute(pos.slice(), 3)];
      g.morphAttributes.normal = [new THREE.Float32BufferAttribute(nrm.slice(), 3)];
      return g;
    };

    const labelRect = { x0: LABEL.x0, x1: LABEL.x1, s0: sAtY(LABEL.y0), s1: sAtY(LABEL.y1) };
    const shardRoot = new THREE.Group(); body.add(shardRoot);
    const labelRoot = new THREE.Group(); body.add(labelRoot); // intact label = the same patches at rest
    const shards = [];
    const crackPos = [], crackDist = [];
    let maxDist = 0;
    for (let i = 0; i < nSites; i++) {
      let poly = voronoi.cellPolygon(i);
      if (!poly || poly.length < 4) continue;
      poly = poly.slice(0, -1);
      if (centroidOf(poly)[2] < 0) poly.reverse();
      const rag = ragged(poly);
      const c = centroidOf(rag);
      if (Math.abs(c[2]) < 0.002) continue;
      const pos = [], nrm = [], col = [];
      const origin = solid(surf, rag, c, pos, nrm, col);
      for (let j = 0; j < rag.length; j++) {
        const p = rag[j], q = rag[(j + 1) % rag.length];
        surf(p[0], p[1], 0.006, a3); surf(q[0], q[1], 0.006, b3);
        crackPos.push(a3.x, a3.y, a3.z, b3.x, b3.y, b3.z);
        const da = Math.hypot(p[0] - imp.x, p[1] - imp.s), db = Math.hypot(q[0] - imp.x, q[1] - imp.s);
        crackDist.push(da, db); maxDist = Math.max(maxDist, da, db);
      }
      const mesh = new THREE.Mesh(morphable(pos, nrm, col), shardMat);
      mesh.frustumCulled = false; mesh.morphTargetInfluences = [0];
      mesh.position.copy(origin); shardRoot.add(mesh);

      // the part of the paper label stuck to this shard
      let lp = clipRect(rag, labelRect), lc = null, labelMesh = null;
      if (lp) { lc = centroidOf(lp); if (Math.abs(lc[2]) <= 0.0015) lp = null; }
      if (lp) {
        const lpos = [], lnrm = [];
        facePatch(surf, lp, lc, 0.007, origin, lpos, lnrm, null, WHITE, 0, false);
        const lg = morphable(lpos, lnrm, null);
        labelMesh = new THREE.Mesh(lg, labelMat); labelMesh.frustumCulled = false; labelMesh.morphTargetInfluences = [0]; mesh.add(labelMesh);
        const intactPatch = new THREE.Mesh(lg, labelMat); intactPatch.morphTargetInfluences = [0]; intactPatch.position.copy(origin); labelRoot.add(intactPatch);
      }
      const pc = prof(c[1]);
      shards.push({
        mesh, labelMesh, rag, c, lp, lc, rest: origin.clone(), theta: c[0] / R, y: pc.y, f: c[1] / S, area: Math.abs(c[2]),
        dist: Math.hypot(c[0] - imp.x, c[1] - imp.s), rnd: [rand(), rand(), rand(), rand(), rand(), rand()],
        axis: new V3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), axis2: new V3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
        scat: new V3(), driftV: new V3(), asmP: new V3(), delay: 0, stag: 0, spin: 0,
      });
    }
    // crack network revealed outward from the impact point just before the pieces separate
    const crackGeo = new THREE.BufferGeometry();
    crackGeo.setAttribute("position", new THREE.Float32BufferAttribute(crackPos, 3));
    crackGeo.setAttribute("aDist", new THREE.Float32BufferAttribute(crackDist, 1));
    const crackMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uReach: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: "attribute float aDist; varying float vD; void main(){ vD = aDist; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float uReach, uAlpha; varying float vD; void main(){ if (vD > uReach) discard; float tip = smoothstep(uReach, uReach - 0.35, vD); gl_FragColor = vec4(vec3(1.0), uAlpha * (0.3 + 0.7 * tip) * mix(1.0, 0.45, clamp(vD / 2.5, 0.0, 1.0))); }",
    });
    const cracks = new THREE.LineSegments(crackGeo, crackMat); cracks.renderOrder = 5; body.add(cracks);
    // crushed-glass bloom at the point of impact
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    surf(imp.x, imp.s, 0.012, star.position); star.rotation.y = imp.x / R; star.renderOrder = 6; body.add(star);

    // ---- tiny fragments, glitter, liquid droplets (instanced) ----
    const impLocal = surf(imp.x, imp.s, 0, new V3());
    const NF = lite ? 150 : 420;
    const fragGeo = new THREE.TetrahedronGeometry(1, 0);
    const frags = new THREE.InstancedMesh(fragGeo, dustMat, NF); frags.frustumCulled = false; scene.add(frags);
    const fragData = [];
    for (let i = 0; i < NF; i++) {
      const near = rand() < 0.6;
      const o = near ? new V3((rand() - 0.5) * 0.5, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.3) : new V3((rand() - 0.5) * 1.3, (rand() - 0.5) * 3.2, (rand() - 0.5) * 1.3);
      const d = new V3(rand() - 0.5, rand() - 0.42, (rand() - 0.5) * 0.9).normalize();
      fragData.push({ o, d, reach: 0.8 + Math.pow(rand(), 1.6) * 5.2, size: 0.012 + Math.pow(rand(), 2.4) * 0.05, sx: 0.5 + rand(), sy: 0.3 + rand() * 0.6, axis: new V3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), spin: 4 + rand() * 16, fall: 0.3 + rand() * 1.4, life: 0.55 + rand() * 0.45, ph: rand() * 6.28 });
    }
    const ND = lite ? 50 : 130;
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, lite ? 8 : 14, lite ? 6 : 10), dropMat, ND); drops.frustumCulled = false; scene.add(drops);
    const dropData = [];
    for (let i = 0; i < ND; i++) {
      const a = rand() * 6.283, up = 0.2 + rand() * 0.9;
      dropData.push({ o: new V3((rand() - 0.5) * 0.9, (rand() - 0.5) * 2.2 - 0.3, (rand() - 0.5) * 0.6), v: new V3(Math.cos(a) * (1.2 + rand() * 4.2), up * 4.6 - 0.8, Math.sin(a) * 1.6), size: 0.012 + Math.pow(rand(), 2.4) * 0.045, delay: rand() * 0.06 });
    }
    // floating glitter that lingers in the light
    const NG = lite ? 120 : 320;
    const gPos = new Float32Array(NG * 3), gSeed = [];
    for (let i = 0; i < NG; i++) gSeed.push({ d: new V3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), reach: 1 + rand() * 6.5, ph: rand() * 6.28, sp: 0.3 + rand() * 0.9 });
    const gGeo = new THREE.BufferGeometry(); gGeo.setAttribute("position", new THREE.BufferAttribute(gPos, 3));
    const sprite = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.25, "rgba(220,240,255,.6)"); rg.addColorStop(1, "rgba(200,230,255,0)"); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    const glitterMat = new THREE.PointsMaterial({ size: 0.075, map: sprite, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const glitter = new THREE.Points(gGeo, glitterMat); glitter.frustumCulled = false; scene.add(glitter);

    // ---- layout-dependent targets ----
    const silRaw = silhouetteOf(bottleImg), sil = silRaw.map((_, i) => { let a = 0, n = 0; for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < silRaw.length) { a += silRaw[j]; n++; } } return a / n; });
    const silAt = (f) => { const x = clamp01(f) * (sil.length - 1), i = Math.min(sil.length - 2, Math.floor(x)); return lerp(sil[i], sil[i + 1], x - i); };
    // a thin shell shaped like the real bottle (units: world / rig scale, centred on the photo)
    const T = { hw: 1, h: 1 };
    const tsurf = (x, s, off, out, nOut) => {
      const f = clamp01(s / S), f0 = Math.max(0, f - 0.012), f1 = Math.min(1, f + 0.012);
      let tr = (silAt(f1) - silAt(f0)) * T.hw, ty = (f1 - f0) * T.h; const l = Math.hypot(tr, ty) || 1; tr /= l; ty /= l;
      const th = x / R, sn = Math.sin(th), cs = Math.cos(th), r = silAt(f) * T.hw + ty * off;
      out.set(r * sn, (f - 0.5) * T.h - tr * off, r * cs);
      if (nOut) nOut.set(ty * sn, -tr, ty * cs);
      return out;
    };
    const Mimp = new M4(), MimpInv = new M4(), qImp = new Q4(), qImpInv = new Q4();
    const impactPose = { y: 0.1, rx: 0.05, ry: 0, rz: 0.11 };
    const L = { W: 1, H: 1, visW: 1, impW: new V3(), pumpScat: new V3(), pumpAsm: new V3(), pumpAsmS: 1, bottle: { x: 0, y: 0, w: 1, h: 1 } };
    const order = shards.map((_, i) => i);
    const w3 = new V3();

    function layout() {
      const W = stage.clientWidth, H = stage.clientHeight;
      if (!W || !H) return;
      L.W = W; L.H = H; L.visW = (VH * W) / H;
      renderer.setSize(W, H, false);
      camera.aspect = W / H; camera.updateProjectionMatrix();
      const k = (DIST - BG_Z) / DIST;
      bgPlane.scale.set(L.visW * k * 1.04, VH * k * 1.04, 1);
      bgMat.uniforms.uPlaneAr.value = W / H;

      // bottle scale: about half the stage tall, never wider than the stage allows
      const fit = Math.min(1, (L.visW * 0.42) / (R * 2)) * (W < 700 ? 0.92 : 1.06);
      rig.scale.setScalar(fit);
      rig.position.set(0, impactPose.y, 0); rig.rotation.set(impactPose.rx, impactPose.ry, impactPose.rz);
      rig.updateMatrixWorld(true);
      Mimp.copy(body.matrixWorld); MimpInv.copy(Mimp).invert();
      rig.getWorldQuaternion(qImp); qImpInv.copy(qImp).invert();
      L.impW.copy(impLocal).applyMatrix4(Mimp);
      L.fit = fit;

      // scatter: keep each shard's direction from the impact, spread evenly, stay on screen
      const rw = shards.map((s) => w3.copy(s.rest).applyMatrix4(Mimp).clone());
      order.sort((a, b) => Math.atan2(rw[a].y - L.impW.y, rw[a].x - L.impW.x) - Math.atan2(rw[b].y - L.impW.y, rw[b].x - L.impW.x));
      const n = shards.length, hx = L.visW / 2, hy = VH / 2;
      const topLim = hy - (72 / H) * VH - 0.45, botLim = -hy + 0.55;
      order.forEach((si, oi) => {
        const s = shards[si];
        const ang = -Math.PI + ((oi + s.rnd[0] * 0.9) / n) * Math.PI * 2;
        const u = 0.46 + 0.54 * Math.pow(s.rnd[1], 0.8);
        let X = Math.cos(ang) * hx * u * 0.96, Y = Math.sin(ang) * hy * u * 0.9;
        if (Math.abs(X) < hx * 0.62 && Math.abs(Y) < 1.25) Y = (Y >= 0 ? 1 : -1) * (1.45 + s.rnd[2] * 1.2);
        X = Math.max(-hx + 0.35, Math.min(hx - 0.35, X)); Y = Math.max(botLim, Math.min(topLim, Y));
        const z = lerp(-4.2, 2.4, s.rnd[3]), pz = (DIST - z) / DIST;
        s.scat.set(X * pz, Y * pz, z).applyMatrix4(MimpInv);
        s.driftV.set(Math.cos(ang + 1.2) * 0.22, Math.sin(ang + 1.2) * 0.22 + 0.05, (s.rnd[4] - 0.5) * 0.3).applyQuaternion(qImpInv).multiplyScalar(1 / fit);
        s.delay = Math.min(0.2, s.dist * 0.05);
        s.spin = (s.rnd[5] < 0.5 ? -1 : 1) * (2.2 + s.rnd[4] * 5.5) / (0.6 + Math.sqrt(s.area) * 1.6);
      });
      L.pumpScat.set(-hx * 0.1, topLim - 0.95, 0.6).applyMatrix4(MimpInv);

      // assembly: each shard maps to the same (angle, height) on a shell shaped like the real bottle
      const sr = stage.getBoundingClientRect(), br = meetBottle.getBoundingClientRect(), px = VH / H;
      const b = L.bottle;
      b.w = br.width * px; b.h = br.height * px;
      b.x = (br.left - sr.left + br.width / 2 - W / 2) * px; b.y = -(br.top - sr.top + br.height / 2 - H / 2) * px;
      T.hw = b.w / 2 / fit; T.h = b.h / fit;
      const bW = new V3(b.x, b.y, 0);
      shards.forEach((s) => {
        const pos = [], nrm = [];
        const o = solid(tsurf, s.rag, s.c, pos, nrm, null);
        const g = s.mesh.geometry;
        g.morphAttributes.position[0].array.set(pos); g.morphAttributes.normal[0].array.set(nrm);
        if (s.labelMesh) {
          const lpos = [], lnrm = [];
          facePatch(tsurf, s.lp, s.lc, 0.007, o, lpos, lnrm, null, WHITE, 0, false);
          const lg = s.labelMesh.geometry;
          lg.morphAttributes.position[0].array.set(lpos); lg.morphAttributes.normal[0].array.set(lnrm); lg.dispose();
        }
        g.dispose(); // re-upload attributes + morph texture
        s.asmP.copy(o).multiplyScalar(fit).add(bW).applyMatrix4(MimpInv);
        s.stag = 0.55 * s.f + 0.2 * s.rnd[2];
      });
      // the pump returns under the clear cap
      L.pumpAsmS = (b.w / 2 / 0.345 / fit) * 0.97;
      L.pumpAsm.set(b.x, b.y + b.h * 0.15 + 0.59 * L.pumpAsmS * fit, 0).applyMatrix4(MimpInv);
    }

    // ---- per-frame: everything derives from P (+ a little idle float) ----
    const q1 = new Q4(), q2 = new Q4(), pA2 = new V3(), dummy = new THREE.Object3D(), up = new V3(0, 1, 0);
    let clock = 0;
    const solidOrFade = (mat, a) => { const t = a < 0.999; if (mat.transparent !== t) { mat.transparent = t; mat.needsUpdate = true; } mat.opacity = a; };
    function frame() {
      const { fall, crack, burst, flash, drift, bg, asm, sweep, fade } = P;
      const idle = reduced ? 0 : clock;
      const impacted = burst > 0.0004;

      // backdrop: slow push-in and drift, crossfade to the bright water as the bottle is rebuilt
      const u = bgMat.uniforms, prog = tl.progress();
      u.uMix.value = bg; u.uFlash.value = flash;
      u.uZoom.value = 1.04 + prog * 0.1 + Math.sin(idle * 0.11) * 0.006;
      u.uShift.value.set(Math.sin(idle * 0.07) * 0.004, (prog - 0.5) * 0.018);
      u.uDim.value = 0.3 * smooth(clamp01((burst - 0.25) * 3)) * (1 - bg);

      // fall
      const fy = VH / 2 + 3.4 * L.fit;
      rig.position.set(lerp(-0.25, 0, fall), lerp(fy, impactPose.y, fall), 0);
      rig.rotation.set(lerp(0.5, impactPose.rx, fall), lerp(-1.25, impactPose.ry, fall), lerp(0.55, impactPose.rz, fall));
      intact.visible = !impacted; labelRoot.visible = !impacted;
      cracks.visible = crack > 0 && burst < 0.1;
      crackMat.uniforms.uReach.value = crack * (maxDist + 0.4); crackMat.uniforms.uAlpha.value = 0.9 * (1 - burst / 0.1);
      star.material.opacity = cracks.visible ? Math.min(1, crack * 3) * 0.85 * (1 - burst / 0.1) : 0;
      star.visible = star.material.opacity > 0.01;

      const vis = impacted && fade < 0.999;
      shardRoot.visible = vis;
      const alpha = 1 - fade;
      shardMat.opacity = (lite ? 0.42 : 1) * alpha; labelMat.opacity = alpha;
      // pump + tube stay opaque (so the glass refracts them) until they have to fade
      const tubeA = alpha * (1 - smooth(clamp01(asm * 2.2)));
      solidOrFade(blackMat, alpha); solidOrFade(tubeMat, tubeA);
      if (vis) {
        const asmT = asm * 1.72;
        for (let i = 0; i < shards.length; i++) {
          const s = shards[i], m = s.mesh;
          const tau = clamp01((burst - s.delay) / (1 - s.delay)), e = outQuart(tau), e2 = outCubic(tau);
          const a = inOutCubic(clamp01(asmT - s.stag)), free = e * (1 - a);
          // burst → weightless drift
          pA2.copy(s.rest).lerp(s.scat, e).addScaledVector(s.driftV, drift * 1.6 * e);
          pA2.y += Math.sin(idle * 0.45 + s.rnd[0] * 6.28) * 0.07 * free / L.fit;
          pA2.x += Math.cos(idle * 0.31 + s.rnd[1] * 6.28) * 0.05 * free / L.fit;
          q1.setFromAxisAngle(s.axis, s.spin * e2 + (drift * 0.9 + idle * 0.05) * (0.4 + s.rnd[2]) * free);
          q2.setFromAxisAngle(s.axis2, Math.sin(idle * 0.3 + s.rnd[3] * 6.28) * 0.12 * free);
          q1.multiply(q2);
          // assembly onto the RibozHair silhouette
          m.position.copy(pA2).lerp(s.asmP, a);
          m.quaternion.copy(q1).slerp(qImpInv, a);
          const mo = smooth(clamp01((a - 0.35) / 0.65));
          m.morphTargetInfluences[0] = mo;
          if (s.labelMesh) s.labelMesh.morphTargetInfluences[0] = mo;
        }
      }
      // pump + dip tube: thrown clear, then return to cap the rebuilt bottle
      {
        const tau = clamp01(burst / 0.9), e = outQuart(tau), a = inOutCubic(clamp01(asm * 1.6 - 0.5)), free = e * (1 - a);
        pA2.copy(pumpPivot).lerp(L.pumpScat, e); pA2.y += Math.sin(idle * 0.4) * 0.08 * free;
        pump.position.copy(pA2).lerp(L.pumpAsm, a);
        q1.setFromAxisAngle(up.set(0.35, 0.2, 0.9).normalize(), -2.6 * outCubic(tau) - (drift * 0.7 + idle * 0.04) * free);
        pump.quaternion.copy(q1).slerp(qImpInv, a);
        pump.scale.setScalar(lerp(1, L.pumpAsmS, a));
        pump.visible = fade < 0.999;
      }
      // tiny fragments: explosive spray that thins out and sinks away
      frags.visible = impacted && burst < 1 || (impacted && drift < 0.75);
      if (frags.visible) {
        for (let i = 0; i < NF; i++) {
          const f = fragData[i], e = outQuart(clamp01(burst * 1.25)), sink = drift * drift * f.fall * 4.5;
          const life = clamp01(1 - (drift - f.life * 0.6) / 0.25);
          dummy.position.copy(L.impW).addScaledVector(f.o, L.fit).addScaledVector(f.d, f.reach * e * L.fit);
          dummy.position.y -= sink + burst * burst * f.fall * 0.5;
          dummy.quaternion.setFromAxisAngle(f.axis, f.spin * (burst * 1.4 + drift * 1.2) + f.ph + idle * 0.2);
          const sc = f.size * life * Math.min(1, burst * 30) * L.fit;
          dummy.scale.set(sc * f.sx, sc * f.sy, sc);
          dummy.updateMatrix(); frags.setMatrixAt(i, dummy.matrix);
        }
        frags.instanceMatrix.needsUpdate = true;
      }
      // liquid: a ballistic burst of droplets that falls out of frame
      drops.visible = impacted && burst < 0.995;
      if (drops.visible) {
        const T = 1.9;
        for (let i = 0; i < ND; i++) {
          const d = dropData[i], t = Math.max(0, burst - d.delay) * T, k = 1 / (1 + t * 0.35);
          dummy.position.copy(L.impW).addScaledVector(d.o, L.fit);
          dummy.position.x += d.v.x * t * k * L.fit; dummy.position.z += d.v.z * t * k * L.fit;
          dummy.position.y += (d.v.y * t - 3.4 * t * t) * L.fit;
          const vy = d.v.y - 6.8 * t, sp = Math.hypot(d.v.x * k, vy);
          dummy.quaternion.setFromUnitVectors(up.set(0, 1, 0), w3.set(d.v.x * k, vy, d.v.z * k).normalize());
          const sc = d.size * L.fit * Math.min(1, burst * 40) * clamp01((1 - burst) * 5), stretch = 1 + Math.min(1.6, sp * 0.16);
          dummy.scale.set(sc / Math.sqrt(stretch), sc * stretch, sc / Math.sqrt(stretch));
          dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
        }
        drops.instanceMatrix.needsUpdate = true;
      }
      // glitter
      const gA = impacted ? smooth(clamp01(burst * 6)) * (1 - smooth(clamp01((asm - 0.55) / 0.4))) : 0;
      glitter.visible = gA > 0.01;
      if (glitter.visible) {
        const e = outQuart(clamp01(burst * 1.1));
        for (let i = 0; i < NG; i++) {
          const g = gSeed[i], rr = g.reach * e * (1 - asm * 0.75) * L.fit;
          gPos[i * 3] = L.impW.x * (1 - asm) + L.bottle.x * asm + g.d.x * rr * 1.5 + Math.sin(idle * g.sp * 0.3 + g.ph) * 0.12;
          gPos[i * 3 + 1] = L.impW.y * (1 - asm) + L.bottle.y * asm + g.d.y * rr - drift * 0.5 * g.sp + Math.cos(idle * g.sp * 0.25 + g.ph) * 0.12;
          gPos[i * 3 + 2] = g.d.z * rr * 0.9;
        }
        gGeo.attributes.position.needsUpdate = true;
        glitterMat.opacity = gA * (0.55 + 0.25 * Math.sin(idle * 1.3));
      }
      // the light sweep as the pieces lock
      const sw = Math.sin(Math.PI * clamp01(sweep));
      scene.environmentIntensity = 1 + sw * 1.4;
      sweepLight.intensity = sw * 160;
      sweepLight.position.set(L.bottle.x + lerp(-2.4, 2.4, sweep), L.bottle.y + lerp(1.6, -0.6, sweep), 3.2);
      bloom.style.opacity = (sw * 0.75 * (1 - fade * 0.4)).toFixed(3);

      renderer.render(scene, camera);
    }

    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); canvas.style.display = "none"; api.stop(); });
    // keep it smooth on slower GPUs: step the pixel ratio down if frames run long
    let pr = renderer.getPixelRatio(), slow = 0, seen = 0;
    function adapt(dt) {
      if (pr <= 1 || P.burst <= 0 || P.fade >= 1) return;
      seen++; if (dt > 24) slow++;
      if (seen >= 45) { if (slow > 30) { pr = Math.max(1, pr - 0.25); renderer.setPixelRatio(pr); renderer.setSize(L.W, L.H, false); } seen = 0; slow = 0; }
    }
    let running = false;
    const tick = (time, dt) => { clock += Math.min(dt, 50) / 1000; adapt(dt); frame(); };
    const api = {
      layout,
      frame,
      start() { if (!running) { running = true; gsap.ticker.add(tick); } },
      stop() { if (running) { running = false; gsap.ticker.remove(tick); } },
    };
    return api;
  }
}
