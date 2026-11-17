import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// The hero bottle "stays with the viewer": a fixed clone travels from its hero spot to the
// story stage while the hero scrolls away. Transform/opacity only; rects are read on refresh.
export function initTravel(getEnd) {
  const hero = document.querySelector(".hero");
  const src = hero && hero.querySelector(".hero__bottle");
  if (!src) return null;

  const wrap = document.createElement("div");
  wrap.className = "traveller";
  wrap.setAttribute("aria-hidden", "true");
  const img = document.createElement("img");
  img.alt = ""; img.decoding = "async"; img.src = src.currentSrc || src.src;
  wrap.append(img);
  document.body.append(wrap);

  const D = { x: 0, y: 0, s: 1 };
  function measure() {
    let x = 0, y = 0, el = src;
    while (el) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; } // layout box: ignores entrance / tilt transforms
    const w = src.offsetWidth, h = src.offsetHeight, e = getEnd();
    if (!w || !h || !e) return;
    gsap.set(wrap, { left: x, top: y, width: w, height: h });
    D.s = e.h / h; D.x = e.x + e.w / 2 - (x + w / 2); D.y = e.y + e.h / 2 - (y + h / 2);
  }

  let on = false;
  const toggle = (v) => {
    if (v === on) return;
    on = v;
    hero.classList.add("has-traveller");
    hero.classList.toggle("is-departing", v);
    wrap.style.visibility = v ? "visible" : "hidden";
  };

  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true, onUpdate: (self) => toggle(self.progress > 0.0015) },
  });
  tl.fromTo(wrap, { x: 0, y: 0, scale: 1 }, { x: () => D.x, y: () => D.y, scale: () => D.s, duration: 1, ease: "power1.inOut" }, 0)
    .to(wrap, { rotation: -4, duration: 0.5, ease: "sine.inOut" }, 0)
    .to(wrap, { rotation: 0, duration: 0.5, ease: "sine.inOut" }, 0.5);

  ScrollTrigger.addEventListener("refreshInit", measure);
  if (!(src.complete && src.naturalWidth)) src.addEventListener("load", () => ScrollTrigger.refresh(), { once: true });
  measure();
  return { img, measure };
}
