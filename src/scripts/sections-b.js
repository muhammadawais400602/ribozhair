import "../styles/sections-b.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const EASE = "expo.out";

// Sections 11-16. ScrollTriggers are created synchronously, in page order. No pins.
export function initSectionsB() {
  const mm = gsap.matchMedia();
  const canHover = matchMedia("(hover: hover)").matches;

  initFaqState(); // state sync only — works with or without motion
  initAddToCart();

  mm.add({ motion: "(prefers-reduced-motion: no-preference)", desktop: "(min-width: 961px)" }, (ctx) => {
    const { motion, desktop } = ctx.conditions;
    if (!motion) return;
    backdrops();
    trust(canHover);
    reviews(desktop, canHover);
    faq(canHover);
    shop(canHover);
    news(canHover);
    footer();
  });
}

/* ---------- backdrop photos settle from a slow push-in as each section arrives ---------- */
function backdrops() {
  ["trust", "reviews", "faq", "shop"].forEach((name) => {
    const sec = $(`.${name}`);
    const pic = $(".sec-bg picture", sec);
    if (!pic) return;
    gsap.fromTo(pic, { scale: 1.2 }, { scale: 1, ease: "none", scrollTrigger: { trigger: sec, start: "top bottom", end: "top 15%", scrub: true } });
    gsap.fromTo($(".sec-bg", sec), { opacity: 0 }, { opacity: 1, ease: "none", scrollTrigger: { trigger: sec, start: "top bottom", end: "top 55%", scrub: true } });
  });
}

/* ---------- 11. Trust ---------- */
function trust(canHover) {
  const sec = $(".trust");
  const stage = $(".medal-stage", sec);
  const medal = $(".medal", sec);
  const spec = $(".medal__spec", sec);
  const glint = $(".medal__glint", sec);
  const shadow = $(".medal__shadow", sec);
  const tiles = $$(".tile", sec);

  gsap.set(medal, { transformPerspective: 900 });
  // the medal is struck into place: a coin turn that settles
  gsap.from(medal, { rotationY: -115, rotationX: 18, scale: 0.72, opacity: 0, duration: 2.2, ease: EASE, scrollTrigger: { trigger: stage, start: "top 86%", once: true } });
  gsap.from(shadow, { opacity: 0, scaleX: 0.4, duration: 2.2, ease: EASE, scrollTrigger: { trigger: stage, start: "top 86%", once: true } });
  // light travels across the metal as you scroll past it
  gsap.fromTo(spec, { rotation: -70 }, { rotation: 150, ease: "none", scrollTrigger: { trigger: sec, start: "top bottom", end: "bottom top", scrub: 0.6 } });
  gsap.fromTo(glint, { rotation: -25 }, { rotation: 35, ease: "none", scrollTrigger: { trigger: sec, start: "top bottom", end: "bottom top", scrub: 0.6 } });

  if (canHover) {
    const ry = gsap.quickTo(medal, "rotationY", { duration: 1.1, ease: "power3.out" });
    const rx = gsap.quickTo(medal, "rotationX", { duration: 1.1, ease: "power3.out" });
    const sx = gsap.quickTo(shadow, "x", { duration: 1.1, ease: "power3.out" });
    const head = $(".trust__head", sec);
    head.addEventListener("pointermove", (e) => {
      const r = stage.getBoundingClientRect();
      const nx = gsap.utils.clamp(-1, 1, (e.clientX - (r.left + r.width / 2)) / r.width);
      const ny = gsap.utils.clamp(-1, 1, (e.clientY - (r.top + r.height / 2)) / r.height);
      ry(nx * 20); rx(-ny * 16); sx(-nx * 16);
    });
    head.addEventListener("pointerleave", () => { ry(0); rx(0); sx(0); });
  }

  if (canHover) spotlight(tiles);
  // glass tiles settle in from depth, then a single light sweep crosses each one
  gsap.set(tiles, { transformPerspective: 1100, transformOrigin: "50% 100%" });
  const tl = gsap.timeline({ scrollTrigger: { trigger: $(".badge-grid", sec), start: "top 84%", once: true } });
  tl.from(tiles, { y: 90, z: -160, rotationX: -22, opacity: 0, duration: 1.5, ease: EASE, stagger: 0.1, clearProps: "transform,opacity" })
    .fromTo($$(".tile__sweep", sec), { xPercent: -140, skewX: -18 }, { xPercent: 340, skewX: -18, duration: 1.3, ease: "power2.inOut", stagger: 0.1, clearProps: "transform" }, 0.45);
}

/* ---------- 12. Reviews ---------- */
function reviews(desktop, canHover) {
  const sec = $(".reviews");
  const deck = $(".deck", sec);
  const cards = $$(".quote", deck);

  if (desktop) {
    // a stacked deck fans out into a shallow 3D arc as it enters
    gsap.set(cards, { transformPerspective: 1700 });
    const fan = [{ rotationY: 13, z: -50 }, { rotationY: 0, z: 40 }, { rotationY: -13, z: -50 }];
    const tl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: deck, start: "top 96%", end: "top 38%", scrub: 0.8 } });
    cards.forEach((c, i) => {
      tl.fromTo(c,
        { xPercent: (1 - i) * 104, y: 140 + Math.abs(1 - i) * 30, rotationZ: (i - 1) * 7, rotationY: 0, z: -Math.abs(1 - i) * 120, opacity: i === 1 ? 0.2 : 0 },
        { xPercent: 0, y: 0, rotationZ: 0, opacity: 1, ...fan[i], ease: "power2.out" }, 0);
    });
    if (canHover) {
      const ry = gsap.quickTo(deck, "rotationY", { duration: 1.4, ease: "power3.out" });
      const rx = gsap.quickTo(deck, "rotationX", { duration: 1.4, ease: "power3.out" });
      sec.addEventListener("pointermove", (e) => {
        const r = sec.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 7);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 4);
      });
      sec.addEventListener("pointerleave", () => { ry(0); rx(0); });
    }
  } else {
    gsap.from(cards, { x: 90, opacity: 0, duration: 1.4, ease: EASE, stagger: 0.12, scrollTrigger: { trigger: deck, start: "top 88%", once: true } });
  }
  if (canHover) spotlight(cards);
  if (desktop) dragDeck(deck);

  // stars: arrive one by one, then a soft travelling shimmer
  const stars = $$(".stars svg", deck);
  if (stars.length) {
    gsap.from(stars, { scale: 0, rotation: -50, opacity: 0, transformOrigin: "50% 50%", duration: 0.9, ease: "back.out(2.4)", stagger: 0.05, scrollTrigger: { trigger: deck, start: "top 62%", once: true } });
    const shimmer = gsap.to(stars, { keyframes: [{ opacity: 0.45, duration: 0.5 }, { opacity: 1, duration: 0.7 }], ease: "sine.inOut", stagger: { each: 0.09, repeat: -1, repeatDelay: 2.6 }, paused: true });
    ScrollTrigger.create({ trigger: sec, start: "top bottom", end: "bottom top", onToggle: (s) => (s.isActive ? shimmer.play() : shimmer.pause()) });
  }
}

// grab the deck and pull it: it follows with weight and springs back
function dragDeck(deck) {
  const x = gsap.quickTo(deck, "x", { duration: 0.9, ease: "power3.out" });
  const rz = gsap.quickTo(deck, "rotationZ", { duration: 0.9, ease: "power3.out" });
  let startX = null;
  deck.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") return; startX = e.clientX; deck.classList.add("is-dragging"); deck.setPointerCapture(e.pointerId); });
  deck.addEventListener("pointermove", (e) => {
    if (startX == null) return;
    const d = gsap.utils.clamp(-260, 260, (e.clientX - startX) * 0.7);
    x(d); rz(d * 0.012);
  });
  const end = () => {
    if (startX == null) return;
    startX = null; deck.classList.remove("is-dragging");
    gsap.to(deck, { x: 0, rotationZ: 0, duration: 1.4, ease: "elastic.out(1, 0.55)", overwrite: "auto" });
  };
  deck.addEventListener("pointerup", end);
  deck.addEventListener("pointercancel", end);
}

/* ---------- 13. FAQ ---------- */
function initFaqState() {
  $$(".faq .qa").forEach((qa) => {
    const q = $(".qa__q", qa);
    const sync = () => qa.classList.toggle("is-open", q.getAttribute("aria-expanded") === "true");
    new MutationObserver(sync).observe(q, { attributes: true, attributeFilter: ["aria-expanded"] });
    sync();
  });
}
function faq(canHover) {
  const sec = $(".faq");
  const list = $(".faq__list", sec);
  const rows = $$(".qa", list);
  gsap.from(list, { y: 80, opacity: 0, duration: 1.5, ease: EASE, scrollTrigger: { trigger: list, start: "top 88%", once: true } });
  gsap.from(rows, { y: 36, opacity: 0, duration: 1.2, ease: EASE, stagger: 0.055, clearProps: "transform,opacity", scrollTrigger: { trigger: list, start: "top 84%", once: true } });
  if (canHover) spotlight(rows);
}

/* ---------- 14. Shop: three product cards ---------- */
function shop(canHover) {
  const sec = $(".shop");
  const head = $(".shop__head", sec);
  const list = $(".pcards", sec);
  const cards = $$("[data-pcard]", sec);

  gsap.from(head.children, { y: 34, opacity: 0, duration: 1.3, ease: EASE, stagger: 0.1, clearProps: "transform,opacity", scrollTrigger: { trigger: head, start: "top 86%", once: true } });

  // the cards rise in one after another; their bottles settle in behind them
  const tl = gsap.timeline({ scrollTrigger: { trigger: list, start: "top 84%", once: true } });
  tl.from(cards, { y: 90, opacity: 0, rotationX: -7, transformPerspective: 1400, transformOrigin: "50% 100%", duration: 1.6, ease: EASE, stagger: 0.16, clearProps: "transform,opacity" }, 0);
  cards.forEach((card, i) => {
    tl.from($$(".pcard__bottle", card), { y: 120, opacity: 0, scale: 0.9, duration: 1.8, ease: EASE, stagger: 0.09 }, 0.3 + i * 0.16)
      .from($(".pcard__shadow", card), { opacity: 0, scaleX: 0.4, duration: 1.6, ease: EASE }, 0.7 + i * 0.16);
  });

  cards.forEach((card, i) => {
    const frame = $(".pcard__frame", card);
    const turn = $(".pcard__turn", card);
    const bottles = $(".pcard__bottles", card);
    const shadow = $(".pcard__shadow", card);
    gsap.set(turn, { transformPerspective: 900 });

    // slow weightless float (staggered per card); the contact shadow breathes with it
    const idle = gsap.timeline({ repeat: -1, yoyo: true, paused: true, defaults: { duration: 3.2 + i * 0.35, ease: "sine.inOut" } });
    idle.fromTo(bottles, { y: 4 }, { y: -7 }, 0).fromTo(shadow, { scaleX: 1, opacity: 1 }, { scaleX: 0.86, opacity: 0.72 }, 0);
    ScrollTrigger.create({ trigger: card, start: "top bottom", end: "bottom top", onToggle: (s) => (s.isActive ? idle.play() : idle.pause()) });

    // the bottles turn through the scroll, and toward the pointer
    const scrollTurn = { v: 0 }, pointer = { y: 0, x: 0 };
    const apply = () => gsap.set(turn, { rotationY: scrollTurn.v + pointer.y, rotationX: pointer.x });
    gsap.fromTo(scrollTurn, { v: -9 }, { v: 9, ease: "none", onUpdate: apply, scrollTrigger: { trigger: card, start: "top bottom", end: "bottom top", scrub: 0.8 } });
    if (canHover) {
      const ry = gsap.quickTo(pointer, "y", { duration: 1.1, ease: "power3.out", onUpdate: apply });
      const rx = gsap.quickTo(pointer, "x", { duration: 1.1, ease: "power3.out", onUpdate: apply });
      card.addEventListener("pointermove", (e) => {
        const r = frame.getBoundingClientRect();
        const nx = gsap.utils.clamp(-1, 1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.6));
        const ny = gsap.utils.clamp(-1, 1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.6));
        ry(nx * 20); rx(-ny * 6);
      });
      card.addEventListener("pointerleave", () => { ry(0); rx(0); });
    }
  });
  if (canHover) spotlight(cards);
}

// button morph + the clicked card's bottle flying to the cart in the header
function initAddToCart() {
  const cart = $(".nav__cta");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $$(".shop [data-pcard]").forEach((card) => {
    const btn = $("[data-add-cart]", card);
    if (!btn) return;
    let timer;
    btn.addEventListener("click", () => {
      btn.classList.add("is-added");
      clearTimeout(timer);
      timer = setTimeout(() => btn.classList.remove("is-added"), 1900);
      if (reduced) return;
      const src = $(".pcard__bottle--main", card) || $(".pcard__bottle", card);
      if (!src || !cart) return;
      const a = src.getBoundingClientRect();
      const b = cart.getBoundingClientRect();
      const h = Math.min(170, a.height * 0.5);
      const w = h * (a.width / a.height);
      const fly = document.createElement("img");
      fly.className = "fly-bottle";
      fly.alt = "";
      fly.src = src.currentSrc || src.src;
      fly.style.width = `${w}px`;
      fly.style.height = `${h}px`;
      document.body.append(fly);
      const x0 = a.left + a.width / 2 - w / 2, y0 = a.top + a.height * 0.25;
      const x1 = b.left + b.width / 2 - w / 2, y1 = b.top + b.height / 2 - h / 2;
      gsap.set(fly, { x: x0, y: y0, scale: 1, opacity: 0, rotation: 0 });
      gsap.timeline({ onComplete: () => fly.remove() })
        .to(fly, { opacity: 1, duration: 0.15, ease: "none" }, 0)
        .to(fly, { x: x1, duration: 1.05, ease: "power2.inOut" }, 0)
        .to(fly, { y: y1, duration: 1.05, ease: "back.in(1.1)" }, 0)
        .to(fly, { scale: 0.16, rotation: 24, duration: 1.05, ease: "power2.in" }, 0)
        .to(fly, { opacity: 0, duration: 0.2, ease: "none" }, 0.9)
        .fromTo(cart, { scale: 1 }, { scale: 1.1, duration: 0.18, ease: "power2.out", yoyo: true, repeat: 1, clearProps: "transform" }, 0.98);
      gsap.fromTo($(".pcard__bottles", card), { scale: 0.965 }, { scale: 1, duration: 0.9, ease: "back.out(2)", overwrite: "auto" });
    });
  });
}

/* ---------- 15. Newsletter ---------- */
function news(canHover) {
  const sec = $(".news");
  const bg = $(".sec-bg", sec);
  const pic = $(".sec-bg picture", sec);
  // the ocean opens from a rounded window to full bleed
  gsap.fromTo(bg, { clipPath: "inset(14% 7% 10% 7% round 44px)" }, { clipPath: "inset(0% 0% 0% 0% round 0px)", ease: "none", scrollTrigger: { trigger: sec, start: "top 92%", end: "top 12%", scrub: 0.6 } });
  gsap.fromTo(pic, { scale: 1.28 }, { scale: 1, ease: "none", scrollTrigger: { trigger: sec, start: "top bottom", end: "bottom bottom", scrub: true } });
  gsap.from($(".news__field", sec), { y: 60, opacity: 0, scale: 0.94, duration: 1.6, ease: EASE, scrollTrigger: { trigger: $(".news__form", sec), start: "top 90%", once: true } });
}

/* ---------- 16. Footer ---------- */
function footer() {
  const foot = $(".footer");
  const inner = $(".footer__inner", foot);
  // revealed from under the page: content lags behind the edge that uncovers it
  gsap.fromTo(inner, { yPercent: -38 }, { yPercent: 0, ease: "none", scrollTrigger: { trigger: foot, start: "top bottom", end: "bottom bottom", scrub: true } });
  gsap.from($$(".footer__grid > *", foot), { y: 44, opacity: 0, duration: 1.3, ease: EASE, stagger: 0.09, scrollTrigger: { trigger: foot, start: "top 78%", once: true } });
  gsap.fromTo($$(".footer__mark span", foot), { yPercent: 105 }, { yPercent: 0, ease: "none", stagger: 0.08, scrollTrigger: { trigger: $(".footer__mark", foot), start: "top 104%", end: "top 62%", scrub: 0.7 } });
}

/* ---------- helpers ---------- */
function spotlight(els) {
  els.forEach((el) => el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }));
}
