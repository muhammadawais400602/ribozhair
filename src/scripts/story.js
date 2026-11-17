import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const NS = "http://www.w3.org/2000/svg";
const COLS = 2;
const ROWS = 5; // 2 × 5 cells × 2 triangles = 20 shards

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadImage(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

export async function initStory() {
  const story = document.querySelector(".story");
  const stage = story.querySelector(".story__stage");
  const fx = story.querySelector(".story__fx");
  const comp = fx.querySelector(".fx__competitor");
  const shardsBox = fx.querySelector(".fx__shards");
  const meetBottle = story.querySelector("[data-meet-bottle]");
  const bottleImg = meetBottle.querySelector("img");
  const liquid = meetBottle.querySelector(".liquid");
  const heading = story.querySelector(".problem__heading");
  const stmts = [...story.querySelectorAll("[data-stmt]")];
  const blueBg = story.querySelector(".story__bg--blue");
  const tagline = story.querySelector(".meet__tagline");
  const intro = story.querySelector(".meet__intro");
  const badges = [...story.querySelectorAll(".badges .glass-badge")];

  const im = await loadImage(comp.getAttribute("src"));
  const aspect = im ? im.naturalWidth / im.naturalHeight : 0.41;

  // ---- geometry: jittered grid → triangles (normalised 0..1 in image space) ----
  const rand = rng(11);
  const jx = 0.3 / COLS, jy = 0.3 / ROWS;
  const V = [];
  for (let r = 0; r <= ROWS; r++) {
    V[r] = [];
    for (let c = 0; c <= COLS; c++) {
      let u = c / COLS, v = r / ROWS;
      if (c > 0 && c < COLS) u += (rand() - 0.5) * 2 * jx;
      if (r > 0 && r < ROWS) v += (rand() - 0.5) * 2 * jy;
      if (c > 0 && c < COLS && r > 0 && r < ROWS) { /* interior: jitter both */ }
      V[r][c] = [u, v];
    }
  }
  const tris = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = V[r][c], b = V[r][c + 1], d = V[r + 1][c], e = V[r + 1][c + 1];
      if (rand() > 0.5) { tris.push([a, b, d], [b, e, d]); } else { tris.push([a, b, e], [a, e, d]); }
    }
  }

  const shards = tris.map((pts, i) => {
    const el = document.createElementNS(NS, "svg");
    el.setAttribute("class", "shard");
    el.style.cssText = "position:absolute;left:0;top:0;overflow:visible;will-change:transform;opacity:0;visibility:hidden";
    const id = `shard-clip-${i}`;
    const clip = document.createElementNS(NS, "clipPath");
    clip.id = id;
    const poly = document.createElementNS(NS, "polygon");
    clip.append(poly);
    const g = document.createElementNS(NS, "g");
    g.setAttribute("clip-path", `url(#${id})`);
    const image = document.createElementNS(NS, "image");
    image.setAttribute("href", comp.getAttribute("src"));
    image.setAttribute("preserveAspectRatio", "none");
    g.append(image);
    const edge = document.createElementNS(NS, "polygon");
    edge.setAttribute("fill", "none");
    edge.setAttribute("stroke", "rgba(255,255,255,0.55)");
    edge.setAttribute("stroke-width", "1.2");
    edge.setAttribute("stroke-linejoin", "round");
    const sheen = document.createElementNS(NS, "polygon");
    sheen.setAttribute("fill", "rgba(255,255,255,0.07)");
    el.append(clip, g, sheen, edge);
    shardsBox.append(el);
    const uc = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
    const vc = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
    return { el, poly, image, edge, sheen, pts, uc, vc, X: 0, Y: 0 };
  });

  // ---- layout (re-run on every ScrollTrigger refresh) ----
  const L = { W: 0, H: 0, cx: 0, cy: 0, cw: 0, ch: 0, bx: 0, by: 0, bw: 0, bh: 0 };
  const burst = [];
  function layout() {
    const sr = stage.getBoundingClientRect();
    L.W = sr.width; L.H = sr.height;
    L.ch = Math.min(L.H * 0.5, 460);
    L.cw = L.ch * aspect;
    L.cx = L.W / 2; L.cy = L.H * 0.5;
    const ox = L.cx - L.cw / 2, oy = L.cy - L.ch / 2;
    gsap.set(comp, { left: ox, top: oy, width: L.cw, height: L.ch });

    const br = meetBottle.getBoundingClientRect();
    L.bx = br.left - sr.left; L.by = br.top - sr.top; L.bw = br.width; L.bh = br.height;

    const rr = rng(23);
    shards.forEach((s, i) => {
      const P = s.pts.map(([u, v]) => [ox + u * L.cw, oy + v * L.ch]);
      const minX = Math.min(...P.map((p) => p[0])), minY = Math.min(...P.map((p) => p[1]));
      const maxX = Math.max(...P.map((p) => p[0])), maxY = Math.max(...P.map((p) => p[1]));
      const w = maxX - minX, h = maxY - minY;
      const rel = P.map(([x, y]) => `${x - minX},${y - minY}`).join(" ");
      s.poly.setAttribute("points", rel);
      s.edge.setAttribute("points", rel);
      s.sheen.setAttribute("points", rel);
      s.image.setAttribute("x", ox - minX); s.image.setAttribute("y", oy - minY);
      s.image.setAttribute("width", L.cw); s.image.setAttribute("height", L.ch);
      s.el.setAttribute("width", w); s.el.setAttribute("height", h);
      s.X = ox + s.uc * L.cw; s.Y = oy + s.vc * L.ch;
      gsap.set(s.el, { left: minX, top: minY, transformOrigin: `${s.X - minX}px ${s.Y - minY}px` });

      // scatter destination (settles around the heading, never off-screen)
      const ang = Math.atan2(s.Y - L.cy, s.X - L.cx) + (rr() - 0.5) * 1.1;
      const rx = L.W * (0.2 + rr() * 0.3), ry = L.H * (0.2 + rr() * 0.26);
      const tx = Math.min(L.W - 50, Math.max(50, L.cx + Math.cos(ang) * rx));
      const ty = Math.min(L.H - 50, Math.max(L.H * 0.14, L.cy + Math.sin(ang) * ry));
      burst[i] = { x: tx - s.X, y: ty - s.Y, rot: (rr() - 0.5) * 520, sc: 0.8 + rr() * 0.55 };
    });
  }
  ScrollTrigger.addEventListener("refreshInit", layout);
  layout();

  // ---- initial states ----
  gsap.set(comp, { transformOrigin: "50% 50%" });
  gsap.set([heading, ...stmts, tagline, intro, ...badges, bottleImg, liquid], { autoAlpha: 0 });

  // ---- ONE master timeline across Section 3 + Section 4 ----
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: { trigger: story, start: "top top", end: "+=650%", pin: true, scrub: 0.9, anticipatePin: 1, invalidateOnRefresh: true },
  });

  // 3 · competitor bottle falls in from above
  tl.fromTo(comp, { y: () => -(L.cy + L.ch), rotation: -9 }, { y: 0, rotation: 0, duration: 1.7, ease: "power2.in" }, 0);
  // impact → shatter, radial burst
  tl.set(comp, { autoAlpha: 0 }, 1.7);
  tl.set(shards.map((s) => s.el), { autoAlpha: 1 }, 1.7);
  tl.to(shards.map((s) => s.el), {
    x: (i) => burst[i].x, y: (i) => burst[i].y, rotation: (i) => burst[i].rot, scale: (i) => burst[i].sc,
    duration: 1.9, ease: "expo.out", stagger: { each: 0.01, from: "center" },
  }, 1.7);
  // heading + six scattered statements after the shards settle
  tl.fromTo(heading, { autoAlpha: 0, y: 44, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.1, ease: "power3.out" }, 2.9);
  tl.fromTo(stmts, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.2 }, 3.3);
  // hold, then statements clear — shards stay
  tl.to([heading, ...stmts], { autoAlpha: 0, y: -28, duration: 0.8, ease: "power2.in", stagger: 0.04 }, 6.1);
  tl.to(blueBg, { opacity: 1, duration: 1.6, ease: "power1.inOut" }, 6.1);

  // 4 · shards fly inward and assemble onto the RibozHair bottle outline
  tl.to(shards.map((s) => s.el), {
    x: (i) => L.bx + shards[i].uc * L.bw - shards[i].X,
    y: (i) => L.by + shards[i].vc * L.bh - shards[i].Y,
    rotation: 0,
    scaleX: () => L.bw / L.cw,
    scaleY: () => L.bh / L.ch,
    duration: 2.3, ease: "power3.inOut", stagger: { each: 0.045, from: "random" },
  }, 6.9);
  tl.to(shards.map((s) => s.edge), { stroke: "#64B5F6", strokeWidth: 1.8, duration: 0.7, ease: "power2.out" }, 8.6);
  // snap → real bottle fades into focus as shards fade out
  tl.fromTo(bottleImg, { autoAlpha: 0, scale: 1.04 }, { autoAlpha: 1, scale: 1, duration: 1.2, ease: "power2.out" }, 9.0);
  tl.to(shards.map((s) => s.el), { autoAlpha: 0, duration: 1.0, ease: "power1.in" }, 9.2);
  tl.to(liquid, { autoAlpha: 1, duration: 1.0, ease: "power1.out" }, 9.9);
  tl.fromTo(tagline, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out" }, 10.0);
  tl.fromTo(intro, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out" }, 10.25);
  tl.fromTo(badges, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.14 }, 10.5);
  tl.to({}, { duration: 1.0 }, 11.4); // hold on the finished frame

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
    wave(A, 188, 5.5, 0.052, st.p);
    wave(B, 196, 4.2, 0.07, -st.p * 1.3 + 1.2);
    gsap.set(shine, { x: Math.sin(st.p * 0.5) * 16 });
  }
  paint();
  const waveTween = gsap.to(st, { p: Math.PI * 2, duration: 5.5, ease: "none", repeat: -1, onUpdate: paint });
  const sloshTween = gsap.fromTo(lsvg, { rotation: -1.8, transformOrigin: "50% 80%" }, { rotation: 1.8, duration: 3.1, ease: "sine.inOut", yoyo: true, repeat: -1 });
  ScrollTrigger.create({
    trigger: story, start: "top bottom", end: "bottom top",
    onToggle: (self) => { if (self.isActive) { waveTween.resume(); sloshTween.resume(); } else { waveTween.pause(); sloshTween.pause(); } },
  });
}
