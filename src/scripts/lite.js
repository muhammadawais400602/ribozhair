import "../styles/lite.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { initIntro } from "./intro.js";
import { initNav } from "./nav.js";
import { initHero } from "./hero.js";
import { initFaqGlass } from "./faq-glass.js";
import { initThemes, initBackdrops, initReveals, initStars, initSeals, initFaq, initShop, initNewsletter } from "./ui.js";
import moleculeUrl from "../assets/lite/molecule.webp";
import moleculeSmUrl from "../assets/lite/molecule-sm.webp";
import scalp1 from "../assets/lite/scalp-1.webp";
import scalp2 from "../assets/lite/scalp-2.webp";
import scalp3 from "../assets/lite/scalp-3.webp";

// Versions 2 and 3 of the page (see vite.config.js). Same markup and content as version 1, but:
//   2 — clean static layouts with a little motion: entrances, gentle scroll reveals, hover lifts
//   3 — the same layouts where the only animation is opacity (things fade in and out)
// Neither starts WebGL, the background video, pinned scroll scenes or the custom cursor.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// what appears as you scroll, in page order; each entry is one group that arrives together
const GROUPS = [
  ".problem__heading", ".statement",
  ".meet__bottle", ".meet__tagline, .meet__intro", ".badges .glass-badge",
  ".sci__still", ".sci-fact, .sci__seal",
  ".how__head .eyebrow", ".hstep",
  ".ben__intro .eyebrow", ".bpanel",
  ".rchart", ".rcard",
  ".ustep",
  ".medal-stage", ".badge-grid .tile",
  ".deck .quote",
  ".faq__list",
  ".shop__visual", ".shop__card",
  ".news__form",
  ".footer__grid > *", ".footer__mark", ".footer__bar",
];
const SOLO = [".ingr"]; // long lists: each row on its own

export function bootLite({ mode = 2, lenis = null } = {}) {
  const fadeOnly = mode === 3;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  buildStills();
  if (fadeOnly) introFade(); else initIntro(lenis);
  initSeals();
  initStars();
  if (fadeOnly) navBasics(); else initNav(lenis);
  initHero(fadeOnly ? { entrance: "fade", tilt: false, parallax: false } : { tilt: false });

  faqState();
  initThemes();
  initFaq();
  if (!fadeOnly) initFaqGlass();
  initShop();
  addToCart();
  initNewsletter();
  liquid(!fadeOnly && !reduced);

  if (!reduced) {
    if (fadeOnly) fades();
    else {
      initReveals();   // masked headline reveals, [data-reveal] fade-ups, icon strokes
      reveals();
      initBackdrops(); // newsletter ocean: one slow parallax
      chartDraw();
      useDraw();
      gsap.fromTo(".shop__arch-img", { yPercent: -6 }, { yPercent: 6, ease: "none", scrollTrigger: { trigger: ".shop", start: "top bottom", end: "bottom top", scrub: true } });
    }
  }

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

/* ---------- stills that stand in for the 3D scenes ---------- */
function buildStills() {
  const visual = $(".sci__visual");
  if (visual && !$(".sci__still", visual)) {
    const fig = document.createElement("div");
    fig.className = "sci__still";
    const img = new Image();
    img.alt = "Model of the 2-Deoxy-D-Ribose molecule";
    img.decoding = "async"; img.loading = "lazy";
    img.width = 1844; img.height = 1800;
    img.srcset = `${moleculeSmUrl} 922w, ${moleculeUrl} 1844w`;
    img.sizes = "(max-width: 960px) 100vw, 64vw";
    img.src = moleculeUrl;
    fig.append(img);
    visual.append(fig);
  }
  const alts = ["Spray lands on the scalp", "2dDR reaches the follicles", "Hair regrows"];
  $$(".hstep").forEach((step, i) => {
    const src = [scalp1, scalp2, scalp3][i];
    if (!src || $(".hstep__img", step)) return;
    const img = new Image();
    img.className = "hstep__img";
    img.alt = alts[i]; img.decoding = "async"; img.loading = "lazy";
    img.width = 960; img.height = 660;
    img.src = src;
    step.prepend(img);
  });
}

/* ---------- liquid inside the Meet RibozHair bottle ---------- */
function liquid(animate) {
  const box = $(".liquid");
  if (!box) return;
  const A = $(".liquid__a", box), B = $(".liquid__b", box);
  const wave = (path, level, amp, k, ph) => {
    let d = `M-10 ${level + amp * Math.sin(k * -10 + ph)}`;
    for (let x = 0; x <= 210; x += 6) d += ` L${x} ${(level + amp * Math.sin(k * x + ph)).toFixed(2)}`;
    path.setAttribute("d", d + " L210 480 L-10 480Z");
  };
  const st = { p: 0 };
  const paint = () => { wave(A, 176, 5.5, 0.052, st.p); wave(B, 184, 4.2, 0.07, -st.p * 1.3 + 1.2); };
  paint();
  if (!animate) return;
  const tween = gsap.to(st, { p: Math.PI * 2, duration: 6.5, ease: "none", repeat: -1, onUpdate: paint, paused: true });
  ScrollTrigger.create({ trigger: box, start: "top bottom", end: "bottom top", onToggle: (s) => (s.isActive ? tween.resume() : tween.pause()) });
}

/* ---------- version 2: gentle arrivals ---------- */
function reveals() {
  const from = { y: 28, opacity: 0, duration: 1.05, ease: "power3.out", clearProps: "transform,opacity" };
  GROUPS.forEach((sel) => {
    const els = $$(sel).filter((el) => !el.matches("[data-reveal], [data-split]"));
    if (els.length) gsap.from(els, { ...from, stagger: 0.09, scrollTrigger: { trigger: els[0], start: "top 88%", once: true } });
  });
  SOLO.forEach((sel) => $$(sel).forEach((el) => gsap.from(el, { ...from, scrollTrigger: { trigger: el, start: "top 90%", once: true } })));
}

// results curve draws once as the chart arrives
function chartDraw() {
  const chart = $(".rchart");
  if (!chart) return;
  const line = $(".rchart__line", chart), clip = $(".rchart__clip", chart);
  const nodes = $$(".rchart__nodes circle", chart), marks = [...$$(".rchart__ticks text", chart), ...$$(".rchart__guides path", chart)];
  gsap.set(line, { strokeDasharray: 1, strokeDashoffset: 1 });
  gsap.set(clip, { attr: { width: 0 } });
  gsap.set(nodes, { scale: 0, transformOrigin: "50% 50%" });
  gsap.set(marks, { opacity: 0 });
  gsap.timeline({ scrollTrigger: { trigger: chart, start: "top 72%", once: true } })
    .to(line, { strokeDashoffset: 0, duration: 2, ease: "power2.inOut" }, 0)
    .to(clip, { attr: { width: 740 }, duration: 2, ease: "power2.inOut" }, 0)
    .to(nodes, { scale: 1, duration: 0.6, ease: "back.out(2)", stagger: 0.28 }, 0.5)
    .to(marks, { opacity: 1, duration: 0.6, ease: "power1.out" }, 1.3);
}

// How to Use: the connecting line draws across the three steps
function useDraw() {
  const line = $(".usteps__line i");
  if (line) gsap.fromTo(line, { scaleX: 0, scaleY: 0 }, { scaleX: 1, scaleY: 1, duration: 1.8, ease: "power2.inOut", scrollTrigger: { trigger: ".usteps", start: "top 78%", once: true } });
}

/* ---------- version 3: opacity only — things fade in as they arrive and out as they leave ---------- */
function fades() {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("is-in", e.isIntersecting)), { rootMargin: "-7% 0px -7% 0px", threshold: 0 });
  const add = (els) => els.forEach((el, i) => {
    el.classList.add("fx");
    el.style.setProperty("--fd", `${Math.min(i, 5) * 0.08}s`);
    io.observe(el);
  });
  const inGroups = new Set();
  GROUPS.forEach((sel) => { const els = $$(sel); els.forEach((el) => inGroups.add(el)); add(els); });
  SOLO.forEach((sel) => $$(sel).forEach((el) => { inGroups.add(el); add([el]); }));
  // headings, eyebrows, lead paragraphs and notes that are not already inside a fading group
  $$("main [data-split], main [data-reveal]").filter((el) => ![...inGroups].some((g) => g.contains(el))).forEach((el) => add([el]));
}

// logo fades in, holds, fades out to the site (the timings live in lite.css)
function introFade() {
  const root = document.documentElement;
  const intro = document.getElementById("intro");
  const active = root.classList.contains("intro-on") && intro && getComputedStyle(intro).display !== "none";
  if (!active) { root.classList.remove("intro-on"); intro?.remove(); return; }
  root.classList.add("intro-lock");
  scrollTo(0, 0);
  let opened = false, finished = false;
  const open = () => { if (!opened) { opened = true; dispatchEvent(new Event("ribo:intro-open")); } };
  const finish = () => { if (finished) return; finished = true; open(); root.classList.remove("intro-on", "intro-lock"); intro.remove(); };
  intro.addEventListener("animationstart", (e) => e.target === intro && e.animationName === "introFadeOut" && open());
  intro.addEventListener("animationend", (e) => e.target === intro && e.animationName === "introFadeOut" && finish());
  setTimeout(finish, 2600); // safety net
  intro.addEventListener("click", () => intro.classList.add("is-out"));
}

// navigation without the sliding pill or the drop-in
function navBasics() {
  const root = document.documentElement;
  ScrollTrigger.create({
    trigger: ".hero", start: "bottom top+=120",
    onEnter: () => gsap.to(root, { "--na": 0.4, duration: 0.7, ease: "power2.out", overwrite: "auto" }),
    onLeaveBack: () => gsap.to(root, { "--na": 0.1, duration: 0.7, ease: "power2.out", overwrite: "auto" }),
  });
  $$("[data-scroll]").forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    const target = id && id.length > 1 ? $(id) : document.body;
    if (!target) return;
    e.preventDefault();
    if (id === "#top") scrollTo({ top: 0, behavior: "smooth" });
    else target.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

/* ---------- small pieces of behaviour that version 1 keeps inside its section modules ---------- */
function faqState() {
  $$(".faq .qa").forEach((qa) => {
    const q = $(".qa__q", qa);
    const sync = () => qa.classList.toggle("is-open", q.getAttribute("aria-expanded") === "true");
    new MutationObserver(sync).observe(q, { attributes: true, attributeFilter: ["aria-expanded"] });
    sync();
  });
}

function addToCart() {
  const btn = $(".shop [data-add-cart]");
  if (!btn) return;
  let timer;
  btn.addEventListener("click", () => {
    btn.classList.add("is-added");
    clearTimeout(timer);
    timer = setTimeout(() => btn.classList.remove("is-added"), 1900);
  });
}
