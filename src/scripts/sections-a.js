import "../styles/sections-a.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Sections 5-10. ScrollTriggers (pins especially) must be created synchronously, in page order.
export function initSectionsA() {
  const how = initHow();
  import("./scalp.js").then(async (m) => { how.api = (await m.initScalp(document.querySelector(".scalp"))) || how.api; }).catch(console.error);
}

function initHow() {
  const steps = [...document.querySelectorAll("[data-step]")];
  const bar = document.querySelector(".step-bar i");
  const state = { api: { setProgress() {} } };
  let active = -1;
  ScrollTrigger.create({
    trigger: ".how__stage", start: "top top", end: "+=320%", pin: true, anticipatePin: 1,
    onUpdate: (self) => {
      const p = self.progress;
      state.api.setProgress(p);
      gsap.set(bar, { scaleX: p });
      const i = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
      if (i !== active) { active = i; steps.forEach((s, n) => s.classList.toggle("is-active", n === i)); }
    },
  });
  steps[0]?.classList.add("is-active");
  return state;
}

