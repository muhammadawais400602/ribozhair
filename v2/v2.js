import "./v2.css";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- scroll reveals: a staggered fade-up, played once ---------- */
$$("[data-stagger]").forEach((parent) => {
  $$(":scope > [data-r]", parent).forEach((el, i) => { if (!el.style.getPropertyValue("--d")) el.style.setProperty("--d", `${i * 0.09}s`); });
});
const watch = [...$$("[data-r]"), ...$$("[data-tl]"), ...$$("[data-chart]")];
if (reduced || !("IntersectionObserver" in window)) {
  watch.forEach((el) => el.classList.add("in"));
} else {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    io.unobserve(e.target);
  }), { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
  watch.forEach((el) => io.observe(el));
}

/* ---------- top bar + mobile sheet ---------- */
const bar = $("#bar");
const onScroll = () => bar.classList.toggle("is-scrolled", scrollY > 12);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

const burger = $("[data-burger]"), sheet = $("[data-sheet]");
const setMenu = (open) => {
  sheet.classList.toggle("open", open);
  burger.setAttribute("aria-expanded", String(open));
  burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  burger.firstElementChild.firstElementChild.setAttribute("href", open ? "#i-close" : "#i-menu");
  document.body.style.overflow = open ? "hidden" : "";
  burger.style.position = open ? "relative" : "";
  burger.style.zIndex = open ? "70" : "";
};
burger.addEventListener("click", () => setMenu(!sheet.classList.contains("open")));
sheet.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
matchMedia("(min-width: 1101px)").addEventListener("change", (e) => e.matches && setMenu(false));

/* ---------- shop: quantity + add to bag ---------- */
const bagEl = $("[data-bag]"), bagBtn = $("[data-bagbtn]"), toast = $("[data-toast]");
let bag = 0, toastTimer;
const say = (text) => {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
};
$$("[data-product]").forEach((card) => {
  const out = $("output", card), add = $("[data-add]", card);
  let qty = 1;
  $$("[data-q]", card).forEach((b) => b.addEventListener("click", () => {
    qty = Math.min(10, Math.max(1, qty + +b.dataset.q));
    out.textContent = qty;
  }));
  add.addEventListener("click", () => {
    bag += qty;
    bagEl.textContent = bag;
    bagBtn.classList.remove("bump"); void bagBtn.offsetWidth; bagBtn.classList.add("bump");
    say(`Added ${qty} × ${card.dataset.product} to your bag`);
    add.classList.add("done"); add.textContent = "Added";
    setTimeout(() => { add.classList.remove("done"); add.textContent = "Add to Bag"; }, 1500);
  });
});

/* ---------- FAQ: one open at a time, height animated in CSS ---------- */
const qas = $$(".qa");
qas.forEach((qa) => {
  const q = $(".qa__q", qa);
  q.addEventListener("click", () => {
    const open = !qa.classList.contains("open");
    qas.forEach((o) => { o.classList.remove("open"); $(".qa__q", o).setAttribute("aria-expanded", "false"); });
    qa.classList.toggle("open", open);
    q.setAttribute("aria-expanded", String(open));
  });
});

/* ---------- newsletter (client-side only; connect a backend before launch) ---------- */
const form = $("[data-news]"), msg = $("[data-news-msg]");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("input", form);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
  msg.textContent = ok ? "Thanks — you're on the list." : "Please enter a valid email address.";
  if (ok) input.value = "";
});
