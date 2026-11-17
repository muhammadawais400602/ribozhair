import { gsap } from "gsap";

// Custom cursor (dot + glass ring + optional label), ambient light that follows it, magnetic buttons.
export function initCursor() {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const light = document.createElement("div");
  light.className = "cursor-light";
  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  ring.innerHTML = "<span></span>";
  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  document.body.append(light, ring, dot);
  document.documentElement.classList.add("has-cursor");
  const label = ring.firstElementChild;

  gsap.set([ring, dot, light], { xPercent: -50, yPercent: -50, x: innerWidth / 2, y: innerHeight / 2 });
  const dx = gsap.quickTo(dot, "x", { duration: 0.12, ease: "power3.out" });
  const dy = gsap.quickTo(dot, "y", { duration: 0.12, ease: "power3.out" });
  const rx = gsap.quickTo(ring, "x", { duration: 0.55, ease: "power3.out" });
  const ry = gsap.quickTo(ring, "y", { duration: 0.55, ease: "power3.out" });
  const lx = gsap.quickTo(light, "x", { duration: 1.4, ease: "power3.out" });
  const ly = gsap.quickTo(light, "y", { duration: 1.4, ease: "power3.out" });

  let shown = false;
  addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    if (!shown) { shown = true; gsap.to([ring, dot, light], { autoAlpha: 1, duration: 0.5 }); }
    dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); lx(e.clientX); ly(e.clientY);
  }, { passive: true });
  document.addEventListener("pointerleave", () => { shown = false; gsap.to([ring, dot, light], { autoAlpha: 0, duration: 0.4 }); });
  addEventListener("pointerdown", () => gsap.to(ring, { scale: 0.82, duration: 0.25, ease: "power2.out" }));
  addEventListener("pointerup", () => gsap.to(ring, { scale: 1, duration: 0.6, ease: "elastic.out(1, 0.5)" }));

  // hover states (delegated, so content added later works too)
  let state = "";
  const setState = (next, text = "") => {
    if (next === state && label.textContent === text) return;
    state = next;
    label.textContent = text;
    ring.dataset.state = next;
    dot.dataset.state = next;
  };
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest?.("[data-cursor], a, button, label, input, textarea, select, [role='button']");
    if (!t) return setState("");
    if (t.dataset.cursor) return setState("label", t.dataset.cursor);
    if (t.matches("input, textarea, select")) return setState("text");
    setState("link");
  });

  // magnetic buttons
  if (reduced) return;
  const bind = (el) => {
    if (el._magnetic) return;
    el._magnetic = true;
    const mx = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
    const my = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3.out" });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      mx((e.clientX - (r.left + r.width / 2)) * 0.28);
      my((e.clientY - (r.top + r.height / 2)) * 0.38);
    });
    el.addEventListener("pointerleave", () => { mx(0); my(0); });
  };
  const scan = () => document.querySelectorAll("[data-magnetic], .btn, .nav__cta").forEach(bind);
  scan();
  setTimeout(scan, 2500);
}
