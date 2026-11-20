import "../styles/story.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Delaunay } from "d3-delaunay";
import { initTravel } from "./travel.js";

// HDRI is optional and loaded after first paint; a procedural studio is used until (or unless) it arrives
const ENV = import.meta.glob("../assets/env/*.hdr", { eager: true, query: "?url", import: "default" });

const VH = 10; // world units visible vertically at z = 0
const FOV = 22;
const DIST = VH / 2 / Math.tan((FOV * Math.PI) / 360);
const R = 0.72; // competitor body radius
const BODY_Y = -2.3; // bottle pivot offset
const THICK = 0.05;
const PROFILE = [[0.1, 0.016], [0.5, 0], [0.66, 0.03], [0.72, 0.15], [0.72, 0.8], [0.72, 1.6], [0.72, 2.38], [0.705, 2.58], [0.62, 2.79], [0.45, 2.96], [0.31, 3.07], [0.27, 3.2], [0.27, 3.5]];
const LABEL = { x0: -1.2 * R, x1: 1.2 * R, y0: 0.62, y1: 2.08 };
const TEXW = 5; // texels per shard: 4 matrix columns + params

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

// half-width of the real bottle photo per height (0 = base, 1 = top), from its alpha channel
function silhouetteOf(img) {
  const N = 96, out = new Float32Array(N).fill(0.9);
  if (!img || !img.naturalWidth) return out;
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
  const tint = story.querySelector(".story__tint");
  const meetScene = story.querySelector(".scene--meet");
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

  if (!(bottleImg.complete && bottleImg.naturalWidth)) await new Promise((r) => { bottleImg.addEventListener("load", r, { once: true }); bottleImg.addEventListener("error", r, { once: true }); });
  const bottleAR = bottleImg.naturalWidth ? bottleImg.naturalWidth / bottleImg.naturalHeight : 0.305;
  meetBottle.style.setProperty("--bottle-ar", bottleAR);
  const maskUrl = `url("${bottleImg.currentSrc || bottleImg.src}")`;
  liquid.style.webkitMaskImage = maskUrl; liquid.style.maskImage = maskUrl;

  // statements live in two safe zones, above and below the heading's band, so they can never touch it
  const ZONES = [["t", 0.07, 0.95, 0.06, 0], ["t", 0.73, 0.2, 0.44, 0.5], ["b", 0.05, 0.12, 0.1, 1], ["b", 0.77, 0, 0.4, 0], ["b", 0.16, 1, 0.06, 0.5], ["b", 0.6, 0.94, 0.26, 1]];
  function placeStatements() {
    const W = stage.clientWidth, H = stage.clientHeight, mobile = W <= 960;
    const hh = heading.offsetHeight, pad = Math.max(14, H * 0.022), navB = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 72) + 14;
    const bandT = H / 2 - hh / 2 - pad, bandB = H / 2 + hh / 2 + pad;
    stmts.forEach((el, i) => {
      const [zone, x, f, mx, mf] = ZONES[i] || ZONES[0], ch = el.offsetHeight, cw = el.offsetWidth;
      const fr = mobile ? mf : f, top = zone === "t" || mobile && i < 3;
      const z0 = top ? navB : bandB, z1 = Math.max(z0, (top ? bandT : H - pad) - ch);
      el.style.top = `${Math.round(lerp(z0, z1, fr))}px`;
      el.style.left = `${Math.round(Math.max(10, Math.min(W - cw - 10, (mobile ? mx : x) * W)))}px`;
    });
  }

  // where the rebuilt bottle sits inside the stage (== viewport while pinned); read on refresh only
  const END = { x: 0, y: 0, w: 1, h: 1, W: 1, H: 1 };
  function measure() {
    const sr = stage.getBoundingClientRect(), br = meetBottle.getBoundingClientRect();
    END.W = sr.width; END.H = sr.height; END.x = br.left - sr.left; END.y = br.top - sr.top; END.w = br.width; END.h = br.height;
    placeStatements();
    return END;
  }
  measure();

  // scrubbed parameters — the whole 3D scene is a pure function of these
  const P = { hand: 0, intro: 1, crack: 0, burst: 0, drift: 0, asm: 0, sweep: 0, fade: 0 };
  let gl = null;
  try { gl = await buildScene(); } catch (e) { console.warn("[story] WebGL unavailable, using the DOM fallback", e); }
  if (!gl) canvas.style.display = "none";

  const travel = initTravel(measure);

  gsap.set([heading, ...stmts, tagline, intro, ...badges, bottleImg, liquid], { autoAlpha: 0 });

  // ---- ONE master timeline across Section 3 + Section 4 ----
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: story, start: "top top", end: "+=740%", pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true,
      onRefresh: () => { measure(); gl && gl.layout(); },
    },
  });
  // 3 · the hero bottle arrives, turns into the generic clear-glass bottle, cracks, shatters
  tl.to(P, { hand: 1, duration: 0.45, ease: "power1.out" }, 0);
  if (travel) tl.to(travel.img, { opacity: 0, duration: 0.5, ease: "power1.inOut" }, 0.15);
  tl.to(P, { intro: 0, duration: 1.1, ease: "power2.inOut" }, 0.45);
  tl.to(P, { crack: 1, duration: 0.22, ease: "power1.out" }, 1.78);
  tl.to(P, { burst: 1, duration: 2.7 }, 1.98);
  tl.to(P, { drift: 1, duration: 5.2 }, 2.6);
  tl.fromTo(heading, { autoAlpha: 0, y: 44, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.1, ease: "power3.out" }, 3.2);
  tl.fromTo(stmts, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.2 }, 3.6);
  tl.to([heading, ...stmts], { autoAlpha: 0, y: -28, duration: 0.8, ease: "power2.in", stagger: 0.04 }, 6.5);
  tl.to(tint, { opacity: 0, duration: 2.1, ease: "power1.inOut" }, 6.8); // the overcast lifts
  // 4 · the same shards fly inward and assemble into the RibozHair bottle
  tl.to(P, { asm: 1, duration: 2.5 }, 7.4);
  tl.to(P, { sweep: 1, duration: 1.2, ease: "power1.inOut" }, 9.3);
  tl.fromTo(bottleImg, { autoAlpha: 0, scale: 1.025 }, { autoAlpha: 1, scale: 1, duration: 1.0, ease: "power2.out" }, gl ? 9.9 : 7.7);
  tl.to(P, { fade: 1, duration: 0.9, ease: "power1.in" }, 10.1);
  tl.fromTo(shadow, { opacity: 0, scaleX: 0.6 }, { opacity: 1, scaleX: 1, duration: 1.0, ease: "power2.out" }, 10.2);
  tl.to(liquid, { autoAlpha: 0.42, duration: 1.0, ease: "power1.out" }, 10.7);
  tl.to(meetScene, { "--scrim": 1, duration: 1.0 }, 10.5);
  tl.fromTo(tagline, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out" }, 10.7);
  tl.fromTo(intro, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out" }, 10.95);
  tl.fromTo(badges, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.14 }, 11.2);
  tl.to({}, { duration: 1.0 }, 12.1);
  const LIQUID_AT = 10.6;

  // ---- liquid: two sine surfaces sloshing inside the bottle (only while it is visible) ----
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
  let onScreen = false, sloshing = false;
  const slosh = () => {
    const want = onScreen && !reduced && tl.time() > LIQUID_AT;
    if (want === sloshing) return;
    sloshing = want;
    if (want) { waveTween.resume(); sloshTween.resume(); } else { waveTween.pause(); sloshTween.pause(); }
  };
  tl.eventCallback("onUpdate", slosh);

  // the render loop only exists while the section is on screen
  ScrollTrigger.create({
    trigger: story.parentNode && story.parentNode.classList.contains("pin-spacer") ? story.parentNode : story, start: "top bottom", end: "bottom top",
    onToggle: (self) => { onScreen = self.isActive; slosh(); if (gl) { if (onScreen) gl.start(); else gl.stop(); } },
  });
  if (gl) { addEventListener("resize", () => { measure(); gl.layout(); }); gl.layout(); gl.frame(); }
  if (import.meta.env.DEV) window.__story = { tl, P, gl };

  /* ======================================================================== */
  async function buildScene() {
    const pr = lite ? 1 : Math.min(devicePixelRatio || 1, 1.25);
    const ctxOpts = { antialias: pr <= 1, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" };
    const context = canvas.getContext("webgl2", ctxOpts);
    if (!context) return null;
    const THREE = await import("three");
    const { Vector3: V3, Quaternion: Q4, Matrix4: M4 } = THREE;

    const renderer = new THREE.WebGLRenderer({ canvas, context, ...ctxOpts });
    renderer.setPixelRatio(pr);
    addEventListener("ribo:quality", () => { renderer.setPixelRatio(1); renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); });
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 80);
    camera.position.set(0, 0, DIST);

    // ---- environment for reflections: instant procedural studio, HDRI swapped in when idle ----
    const pmrem = new THREE.PMREMGenerator(renderer);
    {
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    }
    const envUrl = Object.values(ENV)[0];
    if (envUrl) {
      const loadHdr = async () => {
        try {
          const { HDRLoader } = await import("three/examples/jsm/loaders/HDRLoader.js");
          const hdr = await new HDRLoader().loadAsync(envUrl);
          const old = scene.environment;
          scene.environment = pmrem.fromEquirectangular(hdr).texture;
          hdr.dispose(); old.dispose(); pmrem.dispose(); dirty = true;
        } catch (e) { /* keep the procedural studio */ }
      };
      (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(loadHdr, { timeout: 4000 });
    }
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-4, 7, 9); scene.add(key);
    const spot = new THREE.PointLight(0xe6f3ff, 0, 30, 1.6); scene.add(spot); // cursor light, then the "lock" sweep

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
    const C = 2 * Math.PI * R;
    const surf = (x, s, off, out, nOut) => {
      const p = prof(s), th = x / R, sn = Math.sin(th), cs = Math.cos(th), r = p.r + p.nr * off;
      out.set(r * sn, p.y + p.ny * off, r * cs);
      if (nOut) nOut.set(p.nr * sn, p.ny, p.nr * cs);
      return out;
    };

    // ---- fracture: Voronoi cells in the shell's (arc, height) surface space, dense around the impact ----
    const rand = rng(7);
    const imp = { x: 0.18, s: sAtY(0.98) };
    const sites = [[imp.x, imp.s]];
    const rings = lite ? [[0.15, 5], [0.36, 6], [0.72, 7], [1.3, 8], [2.1, 8]] : [[0.1, 5], [0.22, 6], [0.42, 8], [0.75, 9], [1.2, 10], [1.85, 10], [2.7, 9]];
    rings.forEach(([rho, n]) => {
      const a0 = rand() * 6.283;
      for (let j = 0; j < n; j++) {
        const a = a0 + ((j + (rand() - 0.5) * 0.7) / n) * 6.283, rr = rho * (0.8 + rand() * 0.4);
        const x = imp.x + Math.cos(a) * rr, s = imp.s + Math.sin(a) * rr;
        if (s > 0.05 && s < S - 0.05 && Math.abs(x) < C / 2 - 0.05) sites.push([x, s]);
      }
    });
    const dmin = lite ? 0.78 : 0.64, cap = lite ? 40 : 62;
    for (let tries = 0; tries < 1400 && sites.length < cap; tries++) {
      const x = (rand() - 0.5) * C, s = rand() * S;
      if (sites.every((p) => { let dx = Math.abs(p[0] - x); dx = Math.min(dx, C - dx); return Math.hypot(dx, p[1] - s) > dmin; })) sites.push([x, s]);
    }
    const nSites = sites.length;
    const all = sites.concat(sites.map(([x, s]) => [x - C, s]), sites.map(([x, s]) => [x + C, s]));
    const voronoi = Delaunay.from(all).voronoi([-C * 1.5, 0, C * 1.5, S]);

    const wrapX = (x) => { const m = ((x % C) + C) % C; return Math.round(m * 500) / 500; };
    // subdivide + jitter each edge canonically so neighbouring shards share the same ragged crack
    function ragged(poly) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        out.push(a);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.ceil(len / 0.15));
        const fwd = wrapX(a[0]) < wrapX(b[0]) || (wrapX(a[0]) === wrapX(b[0]) && a[1] < b[1]);
        const p0 = fwd ? a : b, p1 = fwd ? b : a, hx = wrapX(p0[0]) + wrapX(p1[0]) * 3.1, hy = p0[1] + p1[1] * 2.3;
        const px = -(p1[1] - p0[1]) / (len || 1), py = (p1[0] - p0[0]) / (len || 1), amp = Math.min(0.03, len * 0.11);
        const edgeLock = (p0[1] < 1e-4 && p1[1] < 1e-4) || (p0[1] > S - 1e-4 && p1[1] > S - 1e-4) ? 0 : 1;
        for (let j = 1; j < n; j++) {
          const jj = fwd ? j : n - j, t = jj / n, w = (hash(hx, hy, jj) - 0.5) * 2 * amp * Math.sin(Math.PI * t) * edgeLock;
          out.push([lerp(p0[0], p1[0], t) + px * w, Math.min(S, Math.max(0, lerp(p0[1], p1[1], t) + py * w))]);
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
      const edges = [[(p) => p[0] >= r.x0, (a, b) => [r.x0, lerp(a[1], b[1], (r.x0 - a[0]) / (b[0] - a[0]))]], [(p) => p[0] <= r.x1, (a, b) => [r.x1, lerp(a[1], b[1], (r.x1 - a[0]) / (b[0] - a[0]))]], [(p) => p[1] >= r.s0, (a, b) => [lerp(a[0], b[0], (r.s0 - a[1]) / (b[1] - a[1])), r.s0]], [(p) => p[1] <= r.s1, (a, b) => [lerp(a[0], b[0], (r.s1 - a[1]) / (b[1] - a[1])), r.s1]]];
      let out = poly;
      for (const [inside, cut] of edges) {
        const inp = out; out = [];
        for (let i = 0; i < inp.length; i++) { const a = inp[i], b = inp[(i + 1) % inp.length], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(cut(a, b)); }
        if (out.length < 3) return null;
      }
      return out;
    }
    const tmpA = new V3(), tmpN = new V3(), tmpB = new V3();
    const STEP = lite ? 0.17 : 0.14;
    // tessellate a surface-space polygon as concentric rings so big shards follow the bottle's curvature
    function facePatch(fn, poly, c, off, origin, pos, nrm, tint, col, bevel, flip) {
      const dense = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
        for (let j = 0; j < n; j++) dense.push([lerp(a[0], b[0], j / n), lerp(a[1], b[1], j / n)]);
      }
      poly = dense;
      let maxR = 0; poly.forEach((p) => { maxR = Math.max(maxR, Math.hypot(p[0] - c[0], p[1] - c[1])); });
      const K = Math.max(1, Math.min(6, Math.ceil(maxR / (STEP * 1.1)))), m = poly.length;
      const at = (k, j) => { const p = poly[j % m], t = k / K; return [lerp(c[0], p[0], t), lerp(c[1], p[1], t)]; };
      const push = (uv, edge) => {
        fn(uv[0], uv[1], off, tmpA, tmpN);
        if (edge && bevel) { fn(c[0], c[1], off, tmpB); tmpB.subVectors(tmpA, tmpB).normalize(); tmpN.addScaledVector(tmpB, bevel).normalize(); }
        if (flip) tmpN.negate();
        pos.push(tmpA.x - origin.x, tmpA.y - origin.y, tmpA.z - origin.z); nrm.push(tmpN.x, tmpN.y, tmpN.z);
        if (col) col.push(tint[0], tint[1], tint[2]);
      };
      const tri = (a, ae, b, be, d, de) => { if (flip) { push(a, ae); push(d, de); push(b, be); } else { push(a, ae); push(b, be); push(d, de); } };
      for (let j = 0; j < m; j++) {
        tri(c, false, at(1, j), K === 1, at(1, j + 1), K === 1);
        for (let k = 1; k < K; k++) {
          const e = k + 1 === K;
          tri(at(k, j), false, at(k + 1, j), e, at(k + 1, j + 1), e);
          tri(at(k, j), false, at(k + 1, j + 1), e, at(k, j + 1), false);
        }
      }
    }
    const WHITE = [1, 1, 1], EDGE = [0.7, 1, 0.92];
    const a3 = new V3(), b3 = new V3(), c3 = new V3(), d3 = new V3(), n3 = new V3();
    // one closed glass piece: outer face, inner face, then side walls. `wall` receives the crack distance of each wall vertex
    function solid(fn, rag, c, pos, nrm, col, wall) {
      const origin = fn(c[0], c[1], -THICK / 2, new V3());
      facePatch(fn, rag, c, 0, origin, pos, nrm, WHITE, col, 0.5, false);
      facePatch(fn, rag, c, -THICK, origin, pos, nrm, WHITE, col, 0.3, true);
      if (wall) for (let i = wall.length, n = pos.length / 3; i < n; i++) wall.push(-1);
      for (let j = 0; j < rag.length; j++) {
        const p = rag[j], q = rag[(j + 1) % rag.length];
        fn(p[0], p[1], 0, a3); fn(q[0], q[1], 0, b3); fn(q[0], q[1], -THICK, c3); fn(p[0], p[1], -THICK, d3);
        n3.subVectors(b3, a3).cross(tmpA.subVectors(d3, a3)).normalize().negate();
        const dist = Math.min(Math.hypot(p[0] - imp.x, p[1] - imp.s), Math.hypot(q[0] - imp.x, q[1] - imp.s));
        for (const v of [a3, d3, b3, b3, d3, c3]) { pos.push(v.x - origin.x, v.y - origin.y, v.z - origin.z); nrm.push(n3.x, n3.y, n3.z); if (col) col.push(EDGE[0], EDGE[1], EDGE[2]); if (wall) wall.push(dist); }
      }
      return origin;
    }

    const labelRect = { x0: LABEL.x0, x1: LABEL.x1, s0: sAtY(LABEL.y0), s1: sAtY(LABEL.y1) };
    const shards = [];
    const G = { pos: [], nrm: [], col: [], wall: [], idx: [] }, Lb = { pos: [], nrm: [], idx: [] };
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
      const id = shards.length, v0 = G.pos.length / 3;
      const origin = solid(surf, rag, c, G.pos, G.nrm, G.col, G.wall);
      for (let k = v0, n = G.pos.length / 3; k < n; k++) G.idx.push(id);
      for (let j = 0; j < rag.length; j++) {
        const p = rag[j], q = rag[(j + 1) % rag.length];
        surf(p[0], p[1], 0.006, a3); surf(q[0], q[1], 0.006, b3);
        crackPos.push(a3.x, a3.y, a3.z, b3.x, b3.y, b3.z);
        const da = Math.hypot(p[0] - imp.x, p[1] - imp.s), db = Math.hypot(q[0] - imp.x, q[1] - imp.s);
        crackDist.push(da, db); maxDist = Math.max(maxDist, da, db);
      }
      // the part of the paper label stuck to this shard
      let lp = clipRect(rag, labelRect), lc = null;
      if (lp) { lc = centroidOf(lp); if (Math.abs(lc[2]) <= 0.0015) lp = null; }
      const l0 = Lb.pos.length / 3;
      if (lp) { facePatch(surf, lp, lc, 0.007, origin, Lb.pos, Lb.nrm, WHITE, null, 0, false); for (let k = l0, n = Lb.pos.length / 3; k < n; k++) Lb.idx.push(id); }
      shards.push({
        rag, c, lp, lc, v0, l0, rest: origin.clone(), f: c[1] / S, area: Math.abs(c[2]),
        dist: Math.hypot(c[0] - imp.x, c[1] - imp.s), rnd: [rand(), rand(), rand(), rand(), rand(), rand()],
        axis: new V3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), axis2: new V3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
        scat: new V3(), driftV: new V3(), asmP: new V3(), push: new V3(), delay: 0, stag: 0, spin: 0,
      });
    }
    const NS = shards.length;

    // ---- every shard in ONE draw call: per-shard matrices live in a small float texture ----
    const TEX = new Float32Array(TEXW * NS * 4);
    const shardTex = new THREE.DataTexture(TEX, TEXW, NS, THREE.RGBAFormat, THREE.FloatType);
    shardTex.minFilter = shardTex.magFilter = THREE.NearestFilter; shardTex.generateMipmaps = false; shardTex.needsUpdate = true;
    const U = { uShardTex: { value: shardTex }, uReach: { value: 0 }, uFade: { value: 0 } };
    const perShard = (mat, glass) => {
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float aShard; attribute float aWall; attribute vec3 aPos2; attribute vec3 aNrm2; uniform sampler2D uShardTex; uniform float uReach; mat4 shardM; float shardW;")
          .replace("#include <beginnormal_vertex>", "int si = int(aShard + 0.5);\nshardM = mat4(texelFetch(uShardTex, ivec2(0, si), 0), texelFetch(uShardTex, ivec2(1, si), 0), texelFetch(uShardTex, ivec2(2, si), 0), texelFetch(uShardTex, ivec2(3, si), 0));\nshardW = texelFetch(uShardTex, ivec2(4, si), 0).x;\nvec3 objectNormal = normalize(mat3(shardM) * mix(normal, aNrm2, shardW));")
          .replace("#include <begin_vertex>", "vec3 transformed = aWall > uReach ? vec3(0.0) : (shardM * vec4(mix(position, aPos2, shardW), 1.0)).xyz;"); // walls stay collapsed until the crack reaches them
        if (glass) glassFrag(sh);
        else sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uFade;").replace("#include <opaque_fragment>", "#include <opaque_fragment>\ngl_FragColor.a *= uFade;");
      };
      mat.customProgramCacheKey = () => (glass ? "shard-glass" : "shard-label");
      return mat;
    };
    // cheap glass: reflections decide the opacity (bright = solid, dark = clear) plus a fresnel rim. No transmission pass.
    function glassFrag(sh) {
      sh.uniforms.uFade = U.uFade;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uFade;")
        .replace("#include <opaque_fragment>", "#include <opaque_fragment>\nfloat fr = pow(1.0 - saturate(abs(dot(normalize(vNormal), normalize(vViewPosition)))), 2.4);\nfloat lum = dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11));\ngl_FragColor.rgb += fr * 0.18;\ngl_FragColor.a = clamp(max(opacity + fr * 0.55, lum * 0.85), 0.0, 1.0) * uFade;");
    }
    const glassBase = { color: 0xe6f6f4, metalness: 1, roughness: 0.07, envMapIntensity: 1.5, transparent: true, opacity: 0.2, depthWrite: false };
    const shardMat = perShard(new THREE.MeshStandardMaterial({ ...glassBase, vertexColors: true }), true);
    const labelMat = perShard(new THREE.MeshStandardMaterial({ color: 0xf3f4f2, roughness: 0.75, metalness: 0, transparent: true }), false);
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.36, metalness: 0, envMapIntensity: 0.8 });
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.4, transparent: true });
    const dustMat = new THREE.MeshStandardMaterial({ color: 0xf2faff, roughness: 0.05, metalness: 0.7, envMapIntensity: 2.6, transparent: true, opacity: 0.9 });
    const dropMat = new THREE.MeshStandardMaterial({ color: 0xf4faff, roughness: 0.03, metalness: 0.35, envMapIntensity: 2.6, transparent: true, opacity: 0.62, depthWrite: false });

    const rig = new THREE.Group(); scene.add(rig);
    const body = new THREE.Group(); body.position.y = BODY_Y; rig.add(body);

    const f32 = (a, n) => new THREE.Float32BufferAttribute(a, n);
    const glassGeo = new THREE.BufferGeometry();
    glassGeo.setAttribute("position", f32(G.pos, 3)); glassGeo.setAttribute("normal", f32(G.nrm, 3)); glassGeo.setAttribute("color", f32(G.col, 3));
    glassGeo.setAttribute("aShard", f32(G.idx, 1)); glassGeo.setAttribute("aWall", f32(G.wall, 1));
    glassGeo.setAttribute("aPos2", f32(G.pos.slice(), 3)); glassGeo.setAttribute("aNrm2", f32(G.nrm.slice(), 3));
    const glass = new THREE.Mesh(glassGeo, shardMat); glass.frustumCulled = false; glass.renderOrder = 3; body.add(glass);
    const labelGeo = new THREE.BufferGeometry();
    labelGeo.setAttribute("position", f32(Lb.pos, 3)); labelGeo.setAttribute("normal", f32(Lb.nrm, 3));
    labelGeo.setAttribute("aShard", f32(Lb.idx, 1)); labelGeo.setAttribute("aWall", f32(new Float32Array(Lb.idx.length).fill(-1), 1));
    labelGeo.setAttribute("aPos2", f32(Lb.pos.slice(), 3)); labelGeo.setAttribute("aNrm2", f32(Lb.nrm.slice(), 3));
    const label = new THREE.Mesh(labelGeo, labelMat); label.frustumCulled = false; label.renderOrder = 2; body.add(label);

    // pump (black) + dip tube: rigid pieces, one draw call each
    const pump = new THREE.Group(); body.add(pump);
    const pumpPivot = new V3(0, 3.95, 0); pump.position.copy(pumpPivot);
    {
      const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
      const part = (r0, r1, h, y) => new THREE.CylinderGeometry(r0, r1, h, 28).translate(0, y - pumpPivot.y + h / 2, 0);
      const parts = [part(0.335, 0.345, 0.36, 3.36), part(0.3, 0.335, 0.07, 3.72), part(0.2, 0.22, 0.12, 3.79), part(0.105, 0.105, 0.3, 3.91), part(0.235, 0.245, 0.3, 4.21), part(0.2, 0.235, 0.06, 4.51), new THREE.BoxGeometry(0.2, 0.12, 0.14).translate(0.22, 4.38 - pumpPivot.y, 0)];
      pump.add(new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed())), blackMat));
    }
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.05, 10).translate(0, 0.3 - pumpPivot.y + 1.525, 0), tubeMat); tube.renderOrder = 1; pump.add(tube);

    // crack network revealed outward from the impact point just before the pieces separate
    const crackGeo = new THREE.BufferGeometry();
    crackGeo.setAttribute("position", f32(crackPos, 3)); crackGeo.setAttribute("aDist", f32(crackDist, 1));
    const crackMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uReach: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: "attribute float aDist; varying float vD; void main(){ vD = aDist; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float uReach, uAlpha; varying float vD; void main(){ if (vD > uReach) discard; float tip = smoothstep(uReach, uReach - 0.35, vD); float a = uAlpha * (0.3 + 0.7 * tip) * mix(1.0, 0.45, clamp(vD / 2.5, 0.0, 1.0)); gl_FragColor = vec4(vec3(a), a); }",
    });
    const cracks = new THREE.LineSegments(crackGeo, crackMat); cracks.renderOrder = 5; cracks.visible = false; body.add(cracks);

    // ---- tiny fragments, droplets (instanced) and glitter (points) ----
    const impLocal = surf(imp.x, imp.s, 0, new V3());
    const NF = lite ? 110 : 240;
    const frags = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), dustMat, NF); frags.frustumCulled = false; frags.visible = false; scene.add(frags);
    const fragData = [];
    for (let i = 0; i < NF; i++) {
      const near = rand() < 0.6;
      const o = near ? new V3((rand() - 0.5) * 0.5, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.3) : new V3((rand() - 0.5) * 1.3, (rand() - 0.5) * 3.2, (rand() - 0.5) * 1.3);
      const d = new V3(rand() - 0.5, rand() - 0.42, (rand() - 0.5) * 0.9).normalize();
      fragData.push({ o, d, reach: 0.8 + Math.pow(rand(), 1.6) * 5.2, size: 0.014 + Math.pow(rand(), 2.4) * 0.05, sx: 0.5 + rand(), sy: 0.3 + rand() * 0.6, axis: new V3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), spin: 4 + rand() * 16, fall: 0.3 + rand() * 1.4, life: 0.55 + rand() * 0.45, ph: rand() * 6.28 });
    }
    const ND = lite ? 40 : 90;
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), dropMat, ND); drops.frustumCulled = false; drops.visible = false; scene.add(drops);
    const dropData = [];
    for (let i = 0; i < ND; i++) {
      const a = rand() * 6.283, up = 0.2 + rand() * 0.9;
      dropData.push({ o: new V3((rand() - 0.5) * 0.9, (rand() - 0.5) * 2.2 - 0.3, (rand() - 0.5) * 0.6), v: new V3(Math.cos(a) * (1.2 + rand() * 4.2), up * 4.6 - 0.8, Math.sin(a) * 1.6), size: 0.012 + Math.pow(rand(), 2.4) * 0.045, delay: rand() * 0.06 });
    }
    const NG = lite ? 90 : 220;
    const gPos = new Float32Array(NG * 3), gSeed = [];
    for (let i = 0; i < NG; i++) gSeed.push({ d: new V3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), reach: 1 + rand() * 6.5, ph: rand() * 6.28, sp: 0.3 + rand() * 0.9 });
    const gGeo = new THREE.BufferGeometry(); gGeo.setAttribute("position", new THREE.BufferAttribute(gPos, 3));
    const sprite = (() => { const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"), rg = g.createRadialGradient(16, 16, 0, 16, 16, 16); rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.3, "rgba(235,246,255,.55)"); rg.addColorStop(1, "rgba(220,240,255,0)"); g.fillStyle = rg; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
    const glitterMat = new THREE.PointsMaterial({ size: 0.075, map: sprite, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
    const glitter = new THREE.Points(gGeo, glitterMat); glitter.frustumCulled = false; glitter.visible = false; scene.add(glitter);

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
    const impactPose = { y: 0.1, rx: 0, ry: 0, rz: 0 }; // upright, so the reshaping pieces stay seamless
    const L = { W: 1, H: 1, visW: 1, fit: 1, impW: new V3(), pumpScat: new V3(), pumpAsm: new V3(), pumpAsmS: new V3(1, 1, 1), bottle: { x: 0, y: 0, w: 1, h: 1 } };
    const order = shards.map((_, i) => i);
    const w3 = new V3();

    function layout() {
      const W = END.W, H = END.H;
      if (!W || !H) return;
      L.W = W; L.H = H; L.visW = (VH * W) / H;
      renderer.setSize(W, H, false);
      camera.aspect = W / H; camera.updateProjectionMatrix();

      // competitor scale: about half the stage tall, never wider than the stage allows
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
      const hx = L.visW / 2, hy = VH / 2;
      const topLim = hy - (72 / H) * VH - 0.45, botLim = -hy + 0.55;
      order.forEach((si, oi) => {
        const s = shards[si];
        const ang = -Math.PI + ((oi + s.rnd[0] * 0.9) / NS) * Math.PI * 2;
        const u = 0.46 + 0.54 * Math.pow(s.rnd[1], 0.8);
        let X = Math.cos(ang) * hx * u * 0.96, Y = Math.sin(ang) * hy * u * 0.9;
        if (Math.abs(X) < hx * 0.62 && Math.abs(Y) < 1.25) Y = (Y >= 0 ? 1 : -1) * (1.45 + s.rnd[2] * 1.2);
        X = Math.max(-hx + 0.35, Math.min(hx - 0.35, X)); Y = Math.max(botLim, Math.min(topLim, Y));
        const z = lerp(-4.2, 2.4, s.rnd[3]), pz = (DIST - z) / DIST;
        s.scat.set(X * pz, Y * pz, z).applyMatrix4(MimpInv);
        s.driftV.set(Math.cos(ang + 1.2) * 0.22, Math.sin(ang + 1.2) * 0.22 + 0.05, (s.rnd[4] - 0.5) * 0.3).applyQuaternion(qImpInv).multiplyScalar(1 / fit);
        s.delay = Math.min(0.2, s.dist * 0.05);
        s.spin = ((s.rnd[5] < 0.5 ? -1 : 1) * (2.2 + s.rnd[4] * 5.5)) / (0.6 + Math.sqrt(s.area) * 1.6);
      });
      if (W < 700) L.pumpScat.set(hx * 0.62 * ((DIST + 2.5) / DIST), (botLim + 0.2) * ((DIST + 2.5) / DIST), -2.5).applyMatrix4(MimpInv);
      else L.pumpScat.set(-hx * 0.1, topLim - 0.95, 0.6).applyMatrix4(MimpInv);

      // assembly: each shard reshapes onto a shell cut to the real bottle's silhouette, exactly over the photo
      const px = VH / H, b = L.bottle;
      b.w = END.w * px; b.h = END.h * px;
      b.x = (END.x + END.w / 2 - W / 2) * px; b.y = -(END.y + END.h / 2 - H / 2) * px;
      T.hw = b.w / 2 / fit; T.h = b.h / fit;
      const bW = new V3(b.x, b.y, 0), p2 = glassGeo.attributes.aPos2, n2 = glassGeo.attributes.aNrm2, lp2 = labelGeo.attributes.aPos2, ln2 = labelGeo.attributes.aNrm2;
      shards.forEach((s) => {
        const pos = [], nrm = [];
        const o = solid(tsurf, s.rag, s.c, pos, nrm, null, null);
        p2.array.set(pos, s.v0 * 3); n2.array.set(nrm, s.v0 * 3);
        if (s.lp) {
          const lpos = [], lnrm = [];
          facePatch(tsurf, s.lp, s.lc, 0.007, o, lpos, lnrm, WHITE, null, 0, false);
          lp2.array.set(lpos, s.l0 * 3); ln2.array.set(lnrm, s.l0 * 3);
        }
        s.asmP.copy(o).multiplyScalar(fit).add(bW).applyMatrix4(MimpInv);
        s.stag = 0.55 * s.f + 0.2 * s.rnd[2];
      });
      p2.needsUpdate = n2.needsUpdate = lp2.needsUpdate = ln2.needsUpdate = true;
      // the pump sits under the clear cap
      L.pumpAsmS.set((b.w / 2 / 0.345 / fit) * 0.96, (b.h * 0.27) / 1.21 / fit, (b.w / 2 / 0.345 / fit) * 0.96);
      L.pumpAsm.set(b.x, b.y + b.h * 0.15 + 0.59 * L.pumpAsmS.y * fit, 0).applyMatrix4(MimpInv);
      dirty = true;
    }

    // ---- per-frame: everything derives from P (+ a little idle float). No allocations in here. ----
    const q1 = new Q4(), q2 = new Q4(), pA2 = new V3(), pB2 = new V3(), dummy = new THREE.Object3D(), up = new V3(0, 1, 0), ONE = new V3(1, 1, 1), m4 = new M4();
    const ptr = { tx: 0, ty: 0, x: 0, y: 0, on: 0, onT: 0 };
    const hover = matchMedia("(hover: hover) and (pointer: fine)").matches && !reduced;
    if (hover) {
      // the stage is pinned to the viewport while this matters, so no rect reads are needed
      stage.addEventListener("pointermove", (e) => { ptr.tx = (e.clientX / L.W) * 2 - 1; ptr.ty = (e.clientY / L.H) * 2 - 1; ptr.onT = 1; }, { passive: true });
      stage.addEventListener("pointerleave", () => { ptr.onT = 0; ptr.tx = 0; ptr.ty = 0; }, { passive: true });
      stage.style.pointerEvents = "auto";
    }
    const ptrL = new V3(), pushT = new V3();
    const setX = gsap.quickSetter([bottleImg, liquid], "x", "px"), setY = gsap.quickSetter([bottleImg, liquid], "y", "px"), setR = gsap.quickSetter([bottleImg, liquid], "rotation", "deg");
    const solidOrFade = (mat, a) => { const t = a < 0.999; if (mat.transparent !== t) { mat.transparent = t; mat.needsUpdate = true; } mat.opacity = a; };
    let clock = 0, dirty = true, lastProg = -1, wasVisible = false, bloomWas = -1;

    function frame() {
      const { hand, intro: unbuilt, crack, burst, drift, asm, sweep, fade } = P;
      const idle = reduced ? 0 : clock;
      const impacted = burst > 0.0004;
      const alpha = hand * (1 - fade);

      // the camera leans with the cursor, but is dead straight whenever the glass has to sit on a photo
      const lock = Math.max(smooth(clamp01(unbuilt * 2.5)), smooth(clamp01((asm - 0.55) / 0.4)));
      camera.position.set(-ptr.x * 0.42 * (1 - lock), ptr.y * 0.24 * (1 - lock), DIST); camera.lookAt(0, 0, 0);
      const pwx = (ptr.x * L.visW) / 2, pwy = (-ptr.y * VH) / 2;
      ptrL.set(pwx, pwy, 0).applyMatrix4(MimpInv);
      if (fade > 0) { setX(ptr.x * 9 * fade); setY(ptr.y * 5 * fade); setR(ptr.x * 1.1 * fade); }

      // one light: follows the cursor, then makes the sweep as the pieces lock
      const sw = Math.sin(Math.PI * clamp01(sweep));
      if (sw > 0.001) { spot.position.set(L.bottle.x + lerp(-2.4, 2.4, sweep), L.bottle.y + lerp(1.6, -0.6, sweep), 3.2); spot.intensity = sw * 150; }
      else { spot.position.set(pwx, pwy, 3.4); spot.intensity = 46 * ptr.on * alpha; }
      scene.environmentIntensity = 1 + sw * 1.2;
      const bl = Math.round(sw * 0.7 * (1 - fade * 0.4) * 100) / 100;
      if (bl !== bloomWas) { bloomWas = bl; bloom.style.opacity = bl; }

      // cracks: the shards' own side walls appear as the fracture front passes them
      U.uReach.value = crack <= 0 ? -0.5 : crack >= 1 ? 1e3 : crack * (maxDist + 0.4);
      U.uFade.value = alpha;
      cracks.visible = crack > 0 && burst < 0.1;
      if (cracks.visible) { crackMat.uniforms.uReach.value = crack * (maxDist + 0.4); crackMat.uniforms.uAlpha.value = 0.9 * (1 - burst / 0.1) * alpha; }

      const vis = alpha > 0.001;
      glass.visible = label.visible = vis;
      if (vis) {
        const asmT = asm * 1.72;
        for (let i = 0; i < NS; i++) {
          const s = shards[i];
          const tau = clamp01((burst - s.delay) / (1 - s.delay)), e = outQuart(tau), e2 = outCubic(tau);
          const a = Math.max(unbuilt, inOutCubic(clamp01(asmT - s.stag))), free = e * (1 - a);
          // burst → weightless drift
          pA2.copy(s.rest).lerp(s.scat, e).addScaledVector(s.driftV, drift * 1.6 * e);
          pA2.y += (Math.sin(idle * 0.45 + s.rnd[0] * 6.28) * 0.07 * free) / L.fit;
          pA2.x += (Math.cos(idle * 0.31 + s.rnd[1] * 6.28) * 0.05 * free) / L.fit;
          // the cursor gently pushes nearby shards aside
          const dx = pA2.x - ptrL.x, dy = pA2.y - ptrL.y, dl = Math.sqrt(dx * dx + dy * dy) || 1, w = Math.exp((-dl * dl * L.fit * L.fit) / 2.2) * ptr.on * free;
          pushT.set(((dx / dl) * w * 0.7) / L.fit, ((dy / dl) * w * 0.7) / L.fit, (w * 0.35) / L.fit);
          s.push.lerp(pushT, 0.09); pA2.add(s.push);
          q1.setFromAxisAngle(s.axis, s.spin * e2 + s.push.length() * L.fit * 0.9 + (drift * 0.9 + idle * 0.05) * (0.4 + s.rnd[2]) * free);
          q2.setFromAxisAngle(s.axis2, Math.sin(idle * 0.3 + s.rnd[3] * 6.28) * 0.12 * free);
          q1.multiply(q2);
          // rebuilt onto the RibozHair silhouette
          pA2.lerp(s.asmP, a); q1.slerp(qImpInv, a);
          m4.compose(pA2, q1, ONE);
          TEX.set(m4.elements, i * TEXW * 4);
          TEX[i * TEXW * 4 + 16] = Math.max(unbuilt, smooth(clamp01((a - 0.35) / 0.65)));
        }
        shardTex.needsUpdate = true;
      }
      // pump + dip tube: thrown clear, then return under the cap
      pump.visible = vis;
      if (vis) {
        const tau = clamp01(burst / 0.9), e = outQuart(tau), a = Math.max(unbuilt, inOutCubic(clamp01(asm * 1.6 - 0.5))), free = e * (1 - a);
        pA2.copy(pumpPivot).lerp(L.pumpScat, e); pA2.y += Math.sin(idle * 0.4) * 0.08 * free;
        pump.position.copy(pA2).lerp(L.pumpAsm, a);
        q1.setFromAxisAngle(up.set(0.35, 0.2, 0.9).normalize(), -2.6 * outCubic(tau) - (drift * 0.7 + idle * 0.04) * free);
        pump.quaternion.copy(q1).slerp(qImpInv, a);
        pump.scale.set(lerp(1, L.pumpAsmS.x, a), lerp(1, L.pumpAsmS.y, a), lerp(1, L.pumpAsmS.z, a));
        solidOrFade(blackMat, alpha);
        const tubeA = alpha * (1 - smooth(clamp01(Math.max(unbuilt, asm * 2.2) * 1.6))) * (1 - smooth(clamp01(burst * 5))); // slips away right after the break
        tube.visible = tubeA > 0.01; tubeMat.opacity = tubeA;
      }
      // tiny fragments: explosive spray that thins out and sinks away
      frags.visible = impacted && drift < 0.75 && vis;
      if (frags.visible) {
        const e = outQuart(clamp01(burst * 1.25)), on = Math.min(1, burst * 30);
        for (let i = 0; i < NF; i++) {
          const f = fragData[i], life = clamp01(1 - (drift - f.life * 0.6) / 0.25);
          dummy.position.copy(L.impW).addScaledVector(f.o, L.fit).addScaledVector(f.d, f.reach * e * L.fit);
          dummy.position.y -= drift * drift * f.fall * 4.5 + burst * burst * f.fall * 0.5;
          dummy.quaternion.setFromAxisAngle(f.axis, f.spin * (burst * 1.4 + drift * 1.2) + f.ph + idle * 0.2);
          const sc = f.size * life * on * L.fit;
          dummy.scale.set(sc * f.sx, sc * f.sy, sc);
          dummy.updateMatrix(); frags.setMatrixAt(i, dummy.matrix);
        }
        frags.instanceMatrix.needsUpdate = true;
      }
      // liquid: a ballistic burst of droplets that falls out of frame
      drops.visible = impacted && burst < 0.995;
      if (drops.visible) {
        const on = Math.min(1, burst * 40) * clamp01((1 - burst) * 5);
        for (let i = 0; i < ND; i++) {
          const d = dropData[i], t = Math.max(0, burst - d.delay) * 1.9, k = 1 / (1 + t * 0.35);
          dummy.position.copy(L.impW).addScaledVector(d.o, L.fit);
          dummy.position.x += d.v.x * t * k * L.fit; dummy.position.z += d.v.z * t * k * L.fit;
          dummy.position.y += (d.v.y * t - 3.4 * t * t) * L.fit;
          const vy = d.v.y - 6.8 * t, stretch = 1 + Math.min(1.6, Math.hypot(d.v.x * k, vy) * 0.16), sc = d.size * L.fit * on;
          dummy.quaternion.setFromUnitVectors(up.set(0, 1, 0), w3.set(d.v.x * k, vy, d.v.z * k).normalize());
          dummy.scale.set(sc / Math.sqrt(stretch), sc * stretch, sc / Math.sqrt(stretch));
          dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
        }
        drops.instanceMatrix.needsUpdate = true;
      }
      // glitter that lingers in the light
      const gA = impacted ? smooth(clamp01(burst * 6)) * (1 - smooth(clamp01((asm - 0.55) / 0.4))) : 0;
      glitter.visible = gA > 0.01;
      if (glitter.visible) {
        const e = outQuart(clamp01(burst * 1.1)), cx = L.impW.x * (1 - asm) + L.bottle.x * asm, cy = L.impW.y * (1 - asm) + L.bottle.y * asm;
        for (let i = 0; i < NG; i++) {
          const g = gSeed[i], rr = g.reach * e * (1 - asm * 0.75) * L.fit;
          gPos[i * 3] = cx + g.d.x * rr * 1.5 + Math.sin(idle * g.sp * 0.3 + g.ph) * 0.12;
          gPos[i * 3 + 1] = cy + g.d.y * rr - drift * 0.5 * g.sp + Math.cos(idle * g.sp * 0.25 + g.ph) * 0.12;
          gPos[i * 3 + 2] = g.d.z * rr * 0.9;
        }
        gGeo.attributes.position.needsUpdate = true;
        glitterMat.opacity = gA * (0.6 + 0.25 * Math.sin(idle * 1.3));
      }
      renderer.render(scene, camera);
      wasVisible = vis;
    }

    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); canvas.style.display = "none"; api.stop(); });
    let running = false;
    // render only when something actually changed: scroll progress, the pointer, or glass that is still drifting
    function tick(time, dt) {
      const prog = tl.progress();
      ptr.x += (ptr.tx - ptr.x) * 0.07; ptr.y += (ptr.ty - ptr.y) * 0.07; ptr.on += (ptr.onT - ptr.on) * 0.06;
      const visible = P.hand > 0.001 && P.fade < 0.999;
      const moving = Math.abs(ptr.tx - ptr.x) + Math.abs(ptr.ty - ptr.y) + Math.abs(ptr.onT - ptr.on) > 0.0015;
      const drifting = !reduced && P.burst > 0.0004;
      if (!(dirty || prog !== lastProg || (visible && (moving || drifting)) || (moving && P.fade > 0) || visible !== wasVisible)) return;
      clock += Math.min(dt, 50) / 1000;
      dirty = false; lastProg = prog;
      frame();
    }
    const api = {
      calls: () => renderer.info.render.calls,
      layout,
      frame,
      start() { if (!running) { running = true; dirty = true; gsap.ticker.add(tick); } },
      stop() { if (running) { running = false; gsap.ticker.remove(tick); } },
    };
    return api;
  }
}
