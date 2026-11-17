import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const EASE = "expo.out";

/* ---------- Theme: one shared colour language that eases between sections ---------- */
const THEMES = {
  dark: { "--bg": "#06142e", "--fg": "#ffffff", "--soft": "rgba(255,255,255,0.72)", "--card": "rgba(255,255,255,0.08)", "--line": "rgba(255,255,255,0.14)", "--accent": "#64b5f6", "--pill": "rgba(255,255,255,0.14)" },
  light: { "--bg": "#f5f8fc", "--fg": "#0d1b2a", "--soft": "rgba(13,27,42,0.68)", "--card": "rgba(255,255,255,0.58)", "--line": "rgba(10,42,94,0.12)", "--accent": "#1e88e5", "--pill": "rgba(10,42,94,0.08)" },
};
THEMES.blue = THEMES.dark;
THEMES.deep = THEMES.dark;

export function initThemes() {
  const root = document.documentElement;
  let current = "light";
  const set = (name) => {
    if (name === current) return;
    current = name;
    gsap.to(root, { ...THEMES[name], duration: 0.9, ease: "power2.out", overwrite: "auto" });
  };
  $$("[data-theme]").forEach((el) => {
    ScrollTrigger.create({
      trigger: el, start: "top 55%", end: "bottom 55%",
      onToggle: (self) => self.isActive && set(el.dataset.theme),
    });
  });
}

/* ---------- Cinematic photo backdrops: slow parallax ---------- */
export function initBackdrops() {
  $$(".sec-bg img").forEach((img) => {
    const host = img.closest(".how") || img.closest("section, footer");
    gsap.fromTo(img, { yPercent: -7 }, { yPercent: 7, ease: "none", scrollTrigger: { trigger: host, start: "top bottom", end: "bottom top", scrub: true } });
  });
}

/* ---------- Reveal system (shared by every section) ---------- */
function splitWords(el) {
  const frag = document.createDocumentFragment();
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) {
      n.textContent.split(/(\s+)/).forEach((t) => {
        if (!t) return;
        if (/^\s+$/.test(t)) { frag.append(" "); return; }
        const w = document.createElement("span"); w.className = "w";
        const i = document.createElement("span"); i.textContent = t;
        w.append(i); frag.append(w);
      });
    } else frag.append(n.cloneNode(true));
  });
  el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
  el.replaceChildren(frag);
  return $$(".w > span", el);
}

export function initReveals() {
  $$("[data-split]").forEach((el) => {
    const words = splitWords(el);
    gsap.from(words, { yPercent: 115, duration: 1.4, ease: EASE, stagger: 0.07, scrollTrigger: { trigger: el, start: "top 86%", once: true } });
  });
  $$("[data-reveal]").forEach((el) => {
    gsap.from(el, { y: 40, opacity: 0, duration: 1.3, ease: EASE, scrollTrigger: { trigger: el, start: "top 88%", once: true } });
  });
  $$("[data-stagger]").forEach((el) => {
    gsap.from(el.children, { y: 56, opacity: 0, duration: 1.3, ease: EASE, stagger: 0.11, scrollTrigger: { trigger: el, start: "top 86%", once: true } });
  });
  // stroke-draw icons as their cards arrive
  $$(".ico").forEach((svg) => {
    const parts = $$("path, circle", svg).filter((p) => !p.hasAttribute("stroke-dasharray"));
    gsap.set(parts, { strokeDasharray: 1, strokeDashoffset: 1 });
    gsap.to(parts, { strokeDashoffset: 0, duration: 1.7, ease: "power2.inOut", stagger: 0.1, scrollTrigger: { trigger: svg, start: "top 92%", once: true } });
  });
}

/* ---------- Cards: soft 3D tilt ---------- */
export function initTilt() {
  if (!matchMedia("(hover: hover)").matches) return;
  $$(".tilt").forEach((card) => {
    const rx = gsap.quickTo(card, "rotationX", { duration: 0.8, ease: "power3.out" });
    const ry = gsap.quickTo(card, "rotationY", { duration: 0.8, ease: "power3.out" });
    gsap.set(card, { transformPerspective: 900 });
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 8);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 8);
    });
    card.addEventListener("pointerleave", () => { rx(0); ry(0); });
  });
}

/* ---------- Ingredients: row lights up as it crosses the viewport centre ---------- */
export function initIngredients() {
  $$("[data-ing]").forEach((row) => {
    ScrollTrigger.create({ trigger: row, start: "top 64%", end: "bottom 64%", onToggle: (s) => row.classList.toggle("is-active", s.isActive) });
  });
}

/* ---------- Results chart ---------- */
export function initChart() {
  const line = $(".chart__line");
  if (!line) return;
  const tl = gsap.timeline({ scrollTrigger: { trigger: ".chart", start: "top 78%", once: true } });
  gsap.set(line, { strokeDasharray: 1, strokeDashoffset: 1 });
  gsap.set(".chart__nodes circle", { scale: 0, transformOrigin: "50% 50%" });
  tl.to(line, { strokeDashoffset: 0, duration: 2.4, ease: "power2.inOut" })
    .to(".chart__area", { opacity: 1, duration: 1.4, ease: "power1.out" }, "<0.9")
    .to(".chart__nodes circle", { scale: 1, duration: 0.8, ease: "back.out(2)", stagger: 0.32 }, "<0.2");
}

/* ---------- Stars, patent seal ---------- */
export function initStars() {
  $$(".stars").forEach((el) => {
    const n = +el.dataset.rating || 0;
    el.innerHTML = Array.from({ length: 5 }, (_, i) =>
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.6 6.4 19.8l1.3-6.2L3 9.3l6.3-.7Z" fill="${i < n ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`).join("");
  });
}

export function initSeals() {
  $$("[data-seal]").forEach((host, i) => {
    host.innerHTML = `
<svg class="seal" viewBox="0 0 200 200" role="img" aria-label="Pakistan Patents Nos. 153/2018 and 382/2026 — Patented">
  <defs>
    <path id="sealTop${i}" d="M26 100 A74 74 0 0 1 174 100"/>
    <path id="sealBot${i}" d="M12 100 A88 88 0 0 0 188 100"/>
  </defs>
  <g class="seal__ring" fill="currentColor">
    <circle cx="100" cy="100" r="97" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="100" cy="100" r="66" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <text font-family="var(--font-d)" font-weight="600" font-size="12" letter-spacing="2.4"><textPath href="#sealTop${i}" startOffset="50%" text-anchor="middle">PAKISTAN PATENTS Nos.</textPath></text>
    <text font-family="var(--font-d)" font-weight="600" font-size="12" letter-spacing="2.4"><textPath href="#sealBot${i}" startOffset="50%" text-anchor="middle">153/2018 · 382/2026</textPath></text>
  </g>
  <text x="100" y="108" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="23" fill="currentColor">Patented</text>
  <path d="M100 124l3.2 6.6 7.2 1-5.2 5 1.2 7.2-6.4-3.4-6.4 3.4 1.2-7.2-5.2-5 7.2-1Z" fill="currentColor"/>
</svg>`;
  });
}

/* ---------- FAQ accordion ---------- */
export function initFaq() {
  const items = $$(".qa");
  items.forEach((qa) => {
    const q = $(".qa__q", qa), a = $(".qa__a", qa);
    q.addEventListener("click", () => {
      const open = q.getAttribute("aria-expanded") === "true";
      items.forEach((o) => {
        const oq = $(".qa__q", o), oa = $(".qa__a", o);
        if (o !== qa && oq.getAttribute("aria-expanded") === "true") {
          oq.setAttribute("aria-expanded", "false");
          gsap.to(oa, { height: 0, duration: 0.8, ease: "expo.inOut" });
        }
      });
      q.setAttribute("aria-expanded", String(!open));
      gsap.to(a, { height: open ? 0 : "auto", duration: 0.9, ease: "expo.inOut", onComplete: () => ScrollTrigger.refresh() });
    });
  });
}

/* ---------- Shop (UI + local cart count; no checkout wired) ---------- */
const PRICES = { 1: null, 3: null, 6: null }; // set PKR amounts here; null shows "—"
export function initShop() {
  const fmt = (n) => (n == null ? "—" : `Rs. ${n.toLocaleString("en-PK")}`);
  $$("[data-bundle-price]").forEach((el) => (el.textContent = fmt(PRICES[el.dataset.bundlePrice])));
  const priceEl = $("[data-price]");
  const out = $("[data-qty-out]");
  const count = $("[data-cart-count]");
  const toast = $(".toast");
  let qty = 1, cart = 0;

  const bundle = () => $('input[name="bundle"]:checked').value;
  const updatePrice = () => {
    const p = PRICES[bundle()];
    priceEl.textContent = p == null ? "Price to be confirmed" : fmt(p * qty);
  };
  $$('input[name="bundle"]').forEach((r) => r.addEventListener("change", updatePrice));
  $$("[data-qty]").forEach((b) => b.addEventListener("click", () => {
    qty = Math.min(10, Math.max(1, qty + +b.dataset.qty));
    out.textContent = qty;
    gsap.fromTo(out, { scale: 1.25 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
    updatePrice();
  }));
  $("[data-add-cart]").addEventListener("click", () => {
    cart += qty;
    count.hidden = false;
    count.textContent = cart;
    gsap.fromTo(count, { scale: 0.4 }, { scale: 1, duration: 0.7, ease: "back.out(3)" });
    toast.textContent = "Added to cart";
    gsap.timeline()
      .fromTo(toast, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: EASE })
      .to(toast, { opacity: 0, y: 10, duration: 0.6, ease: "power2.in" }, "+=1.6");
  });
  updatePrice();
}

/* ---------- Newsletter (client-side only; connect a backend before launch) ---------- */
export function initNewsletter() {
  const form = $(".news__form");
  const input = $("input", form);
  const msg = $(".news__msg", form);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
    msg.textContent = ok ? "Thanks — you're on the list." : "Please enter a valid email address.";
    gsap.fromTo(msg, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.7, ease: EASE });
    if (ok) input.value = "";
  });
}
