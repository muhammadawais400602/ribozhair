import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function initNav(lenis) {
  const nav = document.querySelector(".nav");
  const list = nav.querySelector(".nav__links");
  const pill = nav.querySelector(".nav__pill");
  const links = [...nav.querySelectorAll("[data-nav-link]")];
  const root = document.documentElement;

  gsap.from(nav, { yPercent: -100, opacity: 0, duration: 1.3, ease: "expo.out", delay: 0.15 });

  // Apple-style sliding glass pill
  const moveX = gsap.quickTo(pill, "x", { duration: 0.6, ease: "expo.out" });
  const moveW = gsap.quickTo(pill, "width", { duration: 0.6, ease: "expo.out" });
  let shown = false;
  links.forEach((a) => {
    a.addEventListener("pointerenter", () => {
      const r = a.getBoundingClientRect();
      const p = list.getBoundingClientRect();
      if (!shown) {
        gsap.set(pill, { x: r.left - p.left, width: r.width });
        gsap.to(pill, { opacity: 1, duration: 0.35, ease: "power2.out" });
        shown = true;
      } else {
        moveX(r.left - p.left);
        moveW(r.width);
      }
    });
  });
  list.addEventListener("pointerleave", () => {
    shown = false;
    gsap.to(pill, { opacity: 0, duration: 0.45, ease: "power2.out" });
  });

  // glass gets more opaque once past the hero (0.1 → 0.4)
  ScrollTrigger.create({
    trigger: ".hero",
    start: "bottom top+=120",
    onEnter: () => gsap.to(root, { "--na": 0.4, duration: 0.7, ease: "power2.out", overwrite: "auto" }),
    onLeaveBack: () => gsap.to(root, { "--na": 0.1, duration: 0.7, ease: "power2.out", overwrite: "auto" }),
  });

  // smooth anchor scrolling
  document.querySelectorAll("[data-scroll]").forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const target = id && id.length > 1 ? document.querySelector(id) : document.body;
      if (!target) return;
      e.preventDefault();
      if (lenis) {
        lenis.scrollTo(id === "#top" ? 0 : target, { offset: id === "#top" ? 0 : -8, duration: 2, easing: (t) => 1 - Math.pow(1 - t, 4) });
      } else {
        target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}
