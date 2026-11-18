import { gsap } from "gsap";

const NS = "http://www.w3.org/2000/svg";

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A small fracture radiating from the toggle button: jagged rays with a few side branches.
function crackPaths(seed) {
  const r = rng(seed), out = [];
  const ray = (x, y, ang, segs, len, depth) => {
    let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    for (let i = 0; i < segs; i++) {
      ang += (r() - 0.5) * 0.75;
      const l = len * (0.7 + r() * 0.7);
      x += Math.cos(ang) * l; y += Math.sin(ang) * l;
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      if (depth < 1 && i > 0 && r() > 0.55) ray(x, y, ang + (r() > 0.5 ? 1 : -1) * (0.5 + r() * 0.6), 2 + Math.floor(r() * 2), len * 0.6, depth + 1);
    }
    out.push({ d, depth });
  };
  const rays = 6 + Math.floor(r() * 2);
  for (let i = 0; i < rays; i++) {
    // fanned down and to the left (into the panel and the opening answer), plus two short ones the other way
    const into = i < rays - 2;
    const ang = into ? Math.PI * (0.52 + (i / (rays - 2)) * 0.62 + (r() - 0.5) * 0.12) : Math.PI * (r() > 0.5 ? 1.7 : 0.25) + (r() - 0.5) * 0.6;
    ray(0, 0, ang, into ? 4 + Math.floor(r() * 3) : 2, into ? 26 + r() * 14 : 11 + r() * 7, 0);
  }
  return out;
}

export function initFaqGlass() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll(".faq .qa").forEach((qa, idx) => {
    const q = qa.querySelector(".qa__q"), btn = q.querySelector("i");
    if (!btn) return;

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "qa__crack");
    svg.setAttribute("aria-hidden", "true");
    const g = document.createElementNS(NS, "g");
    const paths = crackPaths(101 + idx * 37).map(({ d, depth }) => {
      return ["qa__crack-shade", "qa__crack-edge"].map((layer) => {
        const p = document.createElementNS(NS, "path");
        p.setAttribute("d", d);
        p.setAttribute("pathLength", "1");
        p.setAttribute("class", `${layer} ${depth ? "qa__crack-branch" : "qa__crack-ray"}`);
        g.append(p);
        return p;
      });
    }).flat();
    const flash = document.createElementNS(NS, "circle");
    flash.setAttribute("r", "26");
    flash.setAttribute("class", "qa__crack-flash");
    g.append(flash);
    svg.append(g);
    qa.append(svg);

    const place = () => g.setAttribute("transform", `translate(${btn.offsetLeft + btn.offsetWidth / 2 + q.offsetLeft} ${btn.offsetTop + btn.offsetHeight / 2 + q.offsetTop})`);

    gsap.set(paths, { strokeDasharray: 1, strokeDashoffset: 1 });
    gsap.set(flash, { scale: 0, opacity: 0, transformOrigin: "50% 50%" });
    const tl = gsap.timeline({ paused: true });
    tl.to(flash, { scale: 1, opacity: 0.9, duration: 0.12, ease: "power2.out" }, 0)
      .to(flash, { scale: 1.9, opacity: 0, duration: 0.5, ease: "power2.out" }, 0.12)
      .to(paths, { strokeDashoffset: 0, duration: 0.6, ease: "expo.out", stagger: { each: 0.012, from: "start" } }, 0.04);

    const sync = () => {
      const open = q.getAttribute("aria-expanded") === "true";
      if (open) { place(); reduced ? tl.progress(1) : tl.timeScale(1).play(); }
      else reduced ? tl.progress(0) : tl.timeScale(1.6).reverse(); // the glass heals as it closes
    };
    new MutationObserver(sync).observe(q, { attributes: true, attributeFilter: ["aria-expanded"] });
  });
}
