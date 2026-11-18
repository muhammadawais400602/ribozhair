import "../styles/sections-a.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const EASE = "expo.out";

// read by molecule.js (lazy-loaded): enter = stage scrolling into view, pin = progress through the pinned assembly
export const sciState = { enter: 0, pin: 0 };

// Sections 5-10. ScrollTriggers (pins especially) are created synchronously, in page order.
export function initSectionsA() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desk = matchMedia("(min-width: 961px)").matches && !reduced;
  const ctx = { desk, reduced };

  initScience(ctx);
  initHow(ctx);
  initBenefits(ctx);
  initIngredients(ctx);
  initResults(ctx);
  initUse(ctx);
  initBackdropSettle(ctx);
  initSpots(ctx);
}

/* cursor light spot on glass cards + gentle tilt toward the pointer */
function initSpots({ reduced }) {
  if (reduced || !matchMedia("(hover: hover)").matches) return;
  $$("#science .spot, #how .spot, #benefits .spot, #results .spot, #use .spot").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", e.clientX - r.left + "px");
      el.style.setProperty("--my", e.clientY - r.top + "px");
    }, { passive: true });
  });
  $$(".sci-fact, .rcard, .ustep__card").forEach(tilt);
}

/* backdrop photos scale-settle into place as their section arrives (never a hard cut) */
function initBackdropSettle({ reduced }) {
  if (reduced) return;
  ["#science", "#benefits", "#ingredients", "#results", "#use"].forEach((id) => {
    const sec = $(id), pic = sec && $(".sec-bg picture", sec);
    if (!pic) return;
    gsap.fromTo(pic, { scale: 1.22 }, { scale: 1, ease: "none", scrollTrigger: { trigger: sec, start: "top bottom", end: "top 8%", scrub: true } });
  });
}

/* ---------- 5. Science ---------- */
function initScience({ desk, reduced }) {
  const stage = $(".sci__stage");
  if (!stage) return;
  const glow = $(".sci__visual .science__glow");
  if (reduced) { sciState.enter = 1; sciState.pin = 1; }
  else if (desk) {
    ScrollTrigger.create({ trigger: stage, start: "top bottom", end: "top top", onUpdate: (s) => (sciState.enter = s.progress) });
    ScrollTrigger.create({
      trigger: stage, start: "top top", end: "+=115%", pin: true, anticipatePin: 1,
      onUpdate: (s) => { sciState.pin = s.progress; gsap.set(glow, { scale: 0.7 + s.progress * 0.5, opacity: 0.55 + s.progress * 0.45 }); },
    });
  } else {
    ScrollTrigger.create({ trigger: stage, start: "top 85%", end: "top 5%", onUpdate: (s) => { sciState.enter = s.progress; sciState.pin = s.progress; } });
  }
  if (reduced) return;
  const proof = $(".sci__proof");
  gsap.from($$(".sci-fact", proof), { y: 70, autoAlpha: 0, rotationX: -18, transformPerspective: 900, transformOrigin: "50% 100%", duration: 1.4, ease: EASE, stagger: 0.13, scrollTrigger: { trigger: proof, start: "top 86%", once: true } });
  gsap.from($(".sci__seal", proof), { rotation: -160, scale: 0.4, autoAlpha: 0, duration: 1.9, ease: EASE, scrollTrigger: { trigger: proof, start: "top 82%", once: true } });
}

/* ---------- 6. How It Works ---------- */
function initHow({ reduced }) {
  const stage = $(".how__stage");
  if (!stage) return;
  const steps = $$("[data-step]", stage);
  const fills = $$(".how__rail span i", stage);
  const marks = $$(".how__rail b", stage);
  const state = { api: { setProgress() {} } };
  let active = -1;
  const show = (i) => {
    if (i === active) return;
    const dir = i > active ? 1 : -1;
    steps.forEach((s, n) => {
      if (n === i) gsap.fromTo(s, { autoAlpha: 0, y: 46 * dir, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: reduced ? 0 : 1.1, ease: EASE, overwrite: true });
      else gsap.to(s, { autoAlpha: 0, y: -34 * dir, scale: 0.98, duration: reduced ? 0 : 0.5, ease: "power2.out", overwrite: true });
    });
    marks.forEach((m, n) => m.classList.toggle("is-on", n <= i));
    active = i;
  };
  ScrollTrigger.create({
    trigger: stage, start: "top top", end: "+=300%", pin: true, anticipatePin: 1,
    onUpdate: (self) => {
      const p = self.progress;
      state.api.setProgress(p);
      fills.forEach((f, k) => gsap.set(f, { scaleX: clamp(p * 3 - k) }));
      show(p < 0.34 ? 0 : p < 0.67 ? 1 : 2);
    },
  });
  show(0);
  // the 3D scene boots when the section is near, not at first paint
  let booted = false;
  const boot = () => {
    if (booted) return; booted = true;
    import("./scalp.js").then(async (m) => { state.api = (await m.initScalp($(".scalp", stage))) || state.api; ScrollTrigger.update(); }).catch(console.error);
  };
  ScrollTrigger.create({ trigger: ".how", start: "top 250%", once: true, onEnter: boot });
}

/* ---------- 7. Benefits ---------- */
function initBenefits({ desk, reduced }) {
  const stage = $(".ben__stage");
  if (!stage || reduced) return;
  const track = $(".ben__track", stage);
  const panels = $$(".bpanel", stage);
  const bar = $(".ben__bar i", stage);

  // each card owns a paused "come alive" timeline; its progress is the card's focus (0 = resting, 1 = in focus)
  const cards = panels.map((p) => {
    const body = $(".bpanel__body", p), photo = $(".bpanel__photo", p), img = $("img", photo), num = $(".bpanel__n", p), ico = $(".bico", p);
    const parts = $$("path, circle", ico);
    const lines = [$("h3", body), $("p", body)].map((el) => {
      const inner = document.createElement("span"); inner.className = "mline__in";
      while (el.firstChild) inner.append(el.firstChild);
      el.classList.add("mline"); el.append(inner);
      return inner;
    });
    const shade = document.createElement("span"); shade.className = "bpanel__lift"; shade.setAttribute("aria-hidden", "true"); p.prepend(shade);
    const sweep = document.createElement("span"); sweep.className = "bpanel__sweep"; sweep.setAttribute("aria-hidden", "true"); body.append(sweep);
    gsap.set(parts, { strokeDasharray: 1, strokeDashoffset: 1 });
    gsap.set(p, { transformPerspective: 1300 });

    const tl = gsap.timeline({ paused: true, defaults: { ease: "none" } });
    tl.fromTo(p, { scale: 0.88, y: 26, opacity: 0.6 }, { scale: 1, y: 0, opacity: 1, duration: 1, ease: "power2.out" }, 0)
      .fromTo(shade, { opacity: 0 }, { opacity: 1, duration: 1 }, 0)
      .fromTo(photo, { scale: 1.22 }, { scale: 1.02, duration: 1, ease: "power1.out" }, 0)
      .fromTo(num, { xPercent: 55, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.25)
      .fromTo(body, { y: 10, opacity: 0.35 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.2)
      .fromTo(ico, { scale: 0.5, rotation: -25 }, { scale: 1, rotation: 0, duration: 0.35, ease: "back.out(2.4)" }, 0.38)
      .to(parts, { strokeDashoffset: 0, duration: 0.4, ease: "power2.inOut", stagger: 0.05 }, 0.42)
      .fromTo(lines, { yPercent: 115 }, { yPercent: 0, duration: 0.4, ease: "power3.out", stagger: 0.12 }, 0.45)
      .fromTo(sweep, { xPercent: -130 }, { xPercent: 330, duration: 0.45, ease: "power1.inOut" }, 0.55);
    tl.progress(0);
    return { p, img, tl, c: 0 };
  });

  if (desk) {
    let vw = window.innerWidth, dist = 0, c0 = 0, cN = 0;
    const measure = () => {
      vw = window.innerWidth;
      dist = Math.max(0, track.offsetWidth - vw);
      cards.forEach((c) => (c.c = c.p.offsetLeft + c.p.offsetWidth / 2)); // layout offsets ignore transforms
      c0 = cards[0].c; cN = cards[cards.length - 1].c;
    };
    measure();
    const paint = (prog) => {
      const x = -dist * prog;
      // the focus point travels from the first card's resting spot to the last card's, so both ends land in focus
      const fx = c0 + (cN - dist - c0) * prog;
      for (const c of cards) {
        const d = (c.c + x - fx) / vw;                         // signed distance from the focus point, in viewport widths
        const f = 1 - clamp((Math.abs(d) - 0.07) / 0.25);      // short plateau at the focus point, then falls away
        c.tl.progress(f);
        gsap.set(c.p, { rotationY: clamp(d * 2.2, -1, 1) * -11 * (1 - f) });
        gsap.set(c.img, { xPercent: clamp(d, -1, 1) * -10 });
      }
    };
    // The track finishes travelling at MOVE of the pinned scroll; the rest is a hold, so the last
    // card is fully open and stays put before the page moves on.
    const MOVE = 0.72;
    const end = () => "+=" + Math.round(dist / MOVE + window.innerHeight * 0.2);
    const slide = gsap.fromTo(track, { x: 0 }, { x: () => -dist, ease: "none", duration: MOVE, onUpdate() { paint(this.progress()); } });
    gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: stage, start: "top top", end, pin: true, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true,
        onRefreshInit: measure, onRefresh: () => { measure(); paint(slide.progress()); },
      },
    }).add(slide, 0).to({}, { duration: 1 - MOVE }, MOVE);
    gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: stage, start: "top top", end: () => "+=" + Math.round(dist), scrub: 0.7 } });
    gsap.from(track, { y: 90, autoAlpha: 0, duration: 1.5, ease: EASE, scrollTrigger: { trigger: stage, start: "top 65%", once: true } });
    paint(0);
  } else {
    cards.forEach((c) => {
      gsap.to(c.tl, { progress: 1, ease: "none", scrollTrigger: { trigger: c.p, start: "top 92%", end: "center 58%", scrub: 0.6 } });
      gsap.fromTo(c.img, { yPercent: -8 }, { yPercent: 8, ease: "none", scrollTrigger: { trigger: c.p, start: "top bottom", end: "bottom top", scrub: true } });
    });
  }
}

function tilt(el) {
  if (!matchMedia("(hover: hover)").matches) return;
  const rx = gsap.quickTo(el, "rotationX", { duration: 0.9, ease: "power3.out" });
  const ry = gsap.quickTo(el, "rotationY", { duration: 0.9, ease: "power3.out" });
  gsap.set(el, { transformPerspective: 1100 });
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    ry(((e.clientX - r.left) / r.width - 0.5) * 7);
    rx(-((e.clientY - r.top) / r.height - 0.5) * 7);
  });
  el.addEventListener("pointerleave", () => { rx(0); ry(0); });
}

/* ---------- 8. Ingredients ---------- */
function initIngredients({ desk, reduced }) {
  const stage = $(".ingr__stage");
  if (!stage) return;
  const sec = stage.closest("section");
  const items = $$(".ingr", stage);
  const rail = $$(".ingr__rail i", stage);
  const wash = $(".ingr__wash", sec);
  const heroIdx = items.findIndex((el) => el.classList.contains("ingr--hero"));

  if (desk) {
    const N = items.length;
    let active = -1;
    const mark = (i) => { if (i !== active) { active = i; rail.forEach((r, n) => r.classList.toggle("is-on", n === i)); } };
    gsap.set(items.slice(1), { autoAlpha: 0 });
    const tl = gsap.timeline({
      defaults: { ease: "power2.inOut" },
      scrollTrigger: {
        trigger: stage, start: "top top", end: "+=" + N * 70 + "%", pin: true, scrub: 0.8, anticipatePin: 1,
        onUpdate: (s) => mark(Math.min(N - 1, Math.floor(s.progress * N * 0.999 + 0.12))),
      },
    });
    items.forEach((el, i) => {
      const ghost = $(".ingr__ghost", el), body = [$(".ingr__meta", el), $("h3", el), $("p", el)];
      if (i > 0) {
        tl.fromTo(body, { yPercent: 0, y: 90, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.42, stagger: 0.05, ease: "power3.out" }, i - 0.16);
        tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, i - 0.16);
        tl.fromTo(ghost, { xPercent: 22, autoAlpha: 0 }, { xPercent: 0, autoAlpha: 1, duration: 0.5, ease: "power3.out" }, i - 0.2);
      }
      tl.to(ghost, { xPercent: -10, duration: 0.7, ease: "none" }, i + 0.1);
      if (i < N - 1) {
        tl.to(body, { y: -80, autoAlpha: 0, duration: 0.3, stagger: 0.03, ease: "power2.in" }, i + 0.56);
        tl.to(ghost, { autoAlpha: 0, duration: 0.25 }, i + 0.6);
        tl.set(el, { autoAlpha: 0 }, i + 0.9);
      }
    });
    if (heroIdx > -1) {
      tl.to(wash, { opacity: 1, duration: 0.5, ease: "power2.out" }, heroIdx - 0.2);
      if (heroIdx < N - 1) tl.to(wash, { opacity: 0, duration: 0.5, ease: "power2.in" }, heroIdx + 0.55);
    }
    const img = $(".sec-bg img", sec);
    if (img) tl.fromTo(img, { xPercent: 3 }, { xPercent: -3, duration: N, ease: "none" }, 0);
    tl.to({}, { duration: 0.25 }, N - 0.25);
    mark(0);
  } else {
    items.forEach((el) => {
      ScrollTrigger.create({ trigger: el, start: "top 68%", end: "bottom 42%", onToggle: (s) => el.classList.toggle("is-active", s.isActive) });
      if (!reduced) gsap.from([$(".ingr__meta", el), $("h3", el), $("p", el)], { y: 44, autoAlpha: 0, duration: 1.2, ease: EASE, stagger: 0.08, scrollTrigger: { trigger: el, start: "top 86%", once: true } });
    });
    if (reduced) items.forEach((el) => el.classList.add("is-active"));
  }
}

/* ---------- 9. Results ---------- */
function initResults({ reduced }) {
  const chart = $(".rchart");
  if (!chart) return;
  const line = $(".rchart__line", chart), clip = $(".rchart__clip", chart), head = $(".rchart__head", chart);
  const nodes = $$(".rchart__nodes circle", chart), ticks = $$(".rchart__ticks text", chart), guides = $$(".rchart__guides path", chart);
  const cards = $$(".rcard");
  const len = line.getTotalLength();
  // where along the curve (0..1) each week marker sits
  const frac = nodes.map((n) => {
    const cx = +n.getAttribute("cx");
    let lo = 0, hi = len;
    for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (line.getPointAtLength(mid).x < cx) lo = mid; else hi = mid; }
    return lo / len;
  });
  if (reduced) { gsap.set(head, { autoAlpha: 0 }); return; }
  gsap.set(line, { strokeDasharray: 1, strokeDashoffset: 1 });
  gsap.set(nodes, { scale: 0, transformOrigin: "50% 50%" });
  gsap.set([ticks, guides], { autoAlpha: 0 });
  gsap.set(clip, { attr: { width: 0 } });
  const st = { p: 0 };
  const paint = () => {
    const pt = line.getPointAtLength(st.p * len);
    gsap.set(line, { strokeDashoffset: 1 - st.p });
    gsap.set(clip, { attr: { width: Math.max(0, pt.x - 40) } });
    gsap.set(head, { attr: { cx: pt.x, cy: pt.y }, autoAlpha: st.p > 0.005 && st.p < 0.995 ? 1 : 0 });
  };
  paint();
  gsap.from(chart, { y: 60, autoAlpha: 0, scale: 0.97, duration: 1.4, ease: EASE, scrollTrigger: { trigger: chart, start: "top 92%", once: true } });
  const tl = gsap.timeline({ scrollTrigger: { trigger: chart, start: "center 88%", end: "center 42%", scrub: 0.9 } });
  tl.to(st, { p: 1, duration: 1, ease: "none", onUpdate: paint }, 0);
  nodes.forEach((n, i) => {
    const at = Math.max(0, frac[i] - 0.02);
    tl.to(n, { scale: 1, duration: 0.09, ease: "back.out(2.6)" }, at)
      .to([ticks[i], guides[i]], { autoAlpha: 1, duration: 0.08, ease: "power1.out" }, at);
  });
  gsap.from(cards, { y: 80, autoAlpha: 0, rotationX: -22, transformPerspective: 900, transformOrigin: "50% 100%", duration: 1.4, ease: EASE, stagger: 0.14, scrollTrigger: { trigger: ".res__cards", start: "top 92%", once: true } });
}

/* ---------- 10. How to Use ---------- */
function initUse({ desk, reduced }) {
  const row = $(".usteps");
  if (!row || reduced) return;
  const steps = $$(".ustep", row), line = $(".usteps__line i", row);
  const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: "top 82%", end: desk ? "top 22%" : "bottom 70%", scrub: 0.9 } });
  tl.to(line, desk ? { scaleX: 1, duration: 3, ease: "none" } : { scaleY: 1, duration: 3, ease: "none" }, 0);
  steps.forEach((s, i) => {
    const parts = $$(".uico path, .uico circle", s);
    gsap.set(parts, { strokeDasharray: 1, strokeDashoffset: 1 });
    const at = i * 0.95;
    tl.from($(".ustep__dot", s), { scale: 0, duration: 0.3, ease: "back.out(3)" }, at)
      .from($(".ustep__n", s), { yPercent: 105, duration: 0.7, ease: "power3.out" }, at)
      .from($(".ustep__card", s), { y: 70, autoAlpha: 0, duration: 0.7, ease: "power3.out" }, at + 0.12)
      .to(parts, { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut", stagger: 0.06 }, at + 0.3);
  });
}
