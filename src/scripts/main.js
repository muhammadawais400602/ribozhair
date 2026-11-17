import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/inter";
import "../styles/main.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { initNav } from "./nav.js";
import { initHero } from "./hero.js";
import { initStory } from "./story.js";
import { initThemes, initReveals, initTilt, initIngredients, initChart, initStars, initSeals, initFaq, initShop, initNewsletter } from "./ui.js";

gsap.registerPlugin(ScrollTrigger);

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

async function boot() {
  initSeals();
  initStars();
  initNav(lenis);
  initHero();

  // Pins first and in page order, so every ScrollTrigger below them measures the final layout
  await initStory();
  const how = initHow();

  initThemes();
  initReveals();
  initTilt();
  initIngredients();
  initChart();
  initFaq();
  initShop();
  initNewsletter();

  // 3D scenes load lazily so the first paint stays light
  import("./molecule.js").then((m) => m.initMolecule(document.querySelector(".science__canvas"), document.querySelector(".science"))).catch(console.error);
  import("./scalp.js").then(async (m) => { how.api = (await m.initScalp(document.querySelector(".scalp"))) || how.api; }).catch(console.error);

  await document.fonts.ready;
  ScrollTrigger.refresh();
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

boot();
