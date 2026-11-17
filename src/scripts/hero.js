import { gsap } from "gsap";

const NS = "http://www.w3.org/2000/svg";

export function initHero() {
  const stage = document.querySelector(".hero__stage");
  const bottle = stage.querySelector(".hero__bottle");
  const svg = stage.querySelector(".hero__lines");
  const callouts = [...stage.querySelectorAll("[data-callout]")];

  // build callout lines: label edge → anchor on the bottle, glass dot at both ends
  const parts = callouts.map((c) => {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("pathLength", "1");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(255,255,255,0.4)");
    path.setAttribute("stroke-width", "1");
    path.style.strokeDasharray = "1";
    const dots = [0, 1].map(() => {
      const d = document.createElementNS(NS, "circle");
      d.setAttribute("r", "4.5");
      d.setAttribute("fill", "rgba(255,255,255,0.22)");
      d.setAttribute("stroke", "rgba(255,255,255,0.65)");
      d.setAttribute("stroke-width", "1");
      return d;
    });
    svg.append(path, ...dots);
    return { c, path, dots };
  });

  function layoutLines() {
    const bx = bottle.offsetLeft, by = bottle.offsetTop, bw = bottle.offsetWidth, bh = bottle.offsetHeight;
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
  const ready = bottle.complete ? Promise.resolve() : new Promise((r) => bottle.addEventListener("load", r, { once: true }));
  ready.then(layoutLines);
  addEventListener("resize", layoutLines);

  // entrance: heading → bottle drop (overshoot) → labels one by one with lines drawing label → bottle
  const tl = gsap.timeline({ defaults: { ease: "expo.out" }, delay: 0.25 });
  tl.from(".hero__wordmark", { opacity: 0, y: 70, scale: 0.9, duration: 1.9 })
    .from(bottle, { yPercent: -135, opacity: 0, duration: 1.6, ease: "back.out(1.25)" }, "-=1.15")
    .from(".hero__foot > *", { opacity: 0, y: 24, duration: 1.1, stagger: 0.12 }, "-=0.9");
  parts.forEach(({ c, path, dots }, i) => {
    const at = i === 0 ? ">-0.4" : ">-0.55";
    tl.from(c, { opacity: 0, y: 14, scale: 0.94, duration: 0.9 }, at)
      .from(dots[0], { opacity: 0, scale: 0, transformOrigin: "50% 50%", duration: 0.5 }, "<0.2")
      .fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" }, "<0.1")
      .from(dots[1], { opacity: 0, scale: 0, transformOrigin: "50% 50%", duration: 0.5 }, ">-0.35");
  });
}
