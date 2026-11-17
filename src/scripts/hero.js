import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const NS = "http://www.w3.org/2000/svg";

export function initHero() {
  const hero = document.querySelector(".hero");
  const stage = hero.querySelector(".hero__stage");
  const product = stage.querySelector(".hero__product");
  const bottle = stage.querySelector(".hero__bottle");
  const svg = stage.querySelector(".hero__lines");
  const callouts = [...stage.querySelectorAll("[data-callout]")];

  // build callout lines: label edge → anchor on the bottle, glass dot at both ends
  const parts = callouts.map((c) => {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("pathLength", "1");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(255,255,255,0.85)");
    path.setAttribute("stroke-width", "1");
    path.style.strokeDasharray = "1";
    const dots = [0, 1].map(() => {
      const d = document.createElementNS(NS, "circle");
      d.setAttribute("r", "4.5");
      d.setAttribute("fill", "rgba(255,255,255,0.5)");
      d.setAttribute("stroke", "rgba(255,255,255,0.95)");
      d.setAttribute("stroke-width", "1");
      return d;
    });
    svg.append(path, ...dots);
    return { c, path, dots };
  });

  // offsets ignore transforms, so the lines stay correct during entrance / tilt
  function layoutLines() {
    const bx = product.offsetLeft, by = product.offsetTop, bw = product.offsetWidth, bh = product.offsetHeight;
    parts.forEach(({ c, path, dots }) => {
      const left = c.dataset.side === "l";
      const ex = left ? c.offsetLeft + c.offsetWidth : c.offsetLeft;
      const ey = c.offsetTop + c.offsetHeight / 2;
      const ax = bx + parseFloat(c.dataset.ax) * bw;
      const ay = by + parseFloat(c.dataset.ay) * bh;
      path.setAttribute("d", `M${ex} ${ey} L${ax} ${ay}`);
      dots[0].setAttribute("cx", ex); dots[0].setAttribute("cy", ey);
      dots[1].setAttribute("cx", ax); dots[1].setAttribute("cy", ay);
    });
  }
  const ready = bottle.complete && bottle.naturalWidth ? Promise.resolve() : new Promise((r) => bottle.addEventListener("load", r, { once: true }));
  ready.then(() => {
    product.style.setProperty("--bottle-ar", bottle.naturalWidth / bottle.naturalHeight);
    product.style.setProperty("--bottle-mask", `url("${bottle.currentSrc || bottle.src}")`);
    layoutLines();
    ScrollTrigger.refresh();
  });
  addEventListener("resize", layoutLines);

  // entrance: heading → bottle drop (overshoot) → labels one by one with lines drawing label → bottle
  const tl = gsap.timeline({ defaults: { ease: "expo.out" }, delay: 0.25 });
  tl.from(".hero__wordmark", { opacity: 0, y: 70, scale: 0.9, duration: 1.9 }, 0.1)
    .from(bottle, { yPercent: -120, opacity: 0, duration: 1.6, ease: "back.out(1.15)" }, "-=1.15")
    .from([".hero__shadow", ".hero__reflect", ".hero__rim"], { opacity: 0, duration: 1.2, ease: "power2.out" }, "-=0.7")
    .from(".hero__foot > *", { opacity: 0, y: 24, duration: 1.1, stagger: 0.12 }, "-=1.0");
  parts.forEach(({ c, path, dots }, i) => {
    const at = i === 0 ? ">-0.6" : ">-0.55";
    tl.from(c, { opacity: 0, y: 14, scale: 0.94, duration: 0.9 }, at)
      .from(dots[0], { opacity: 0, scale: 0, transformOrigin: "50% 50%", duration: 0.5 }, "<0.2")
      .fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" }, "<0.1")
      .from(dots[1], { opacity: 0, scale: 0, transformOrigin: "50% 50%", duration: 0.5 }, ">-0.35");
  });

  // when the opening intro is playing, hold the entrance until its curtain parts
  if (document.documentElement.classList.contains("intro-on")) {
    tl.pause();
    addEventListener("ribo:intro-open", () => tl.play(), { once: true });
  }

  // depth: the product turns slightly toward the pointer, the sea shifts the other way
  if (matchMedia("(hover: hover)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const ry = gsap.quickTo(product, "rotationY", { duration: 1.2, ease: "power3.out" });
    const rx = gsap.quickTo(product, "rotationX", { duration: 1.2, ease: "power3.out" });
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      ry(nx * 9); rx(-ny * 5);
    });
    hero.addEventListener("pointerleave", () => { ry(0); rx(0); });
  }

  // scroll: sea and product separate in depth as the hero leaves
  gsap.to(".hero__wordmark", { yPercent: 40, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });
}
