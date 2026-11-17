import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/inter";
import "../styles/main.css";
import "../styles/cinema.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { initIntro } from "./intro.js";
import { initNav } from "./nav.js";
import { initHero } from "./hero.js";
import { initCursor } from "./cursor.js";
import { initSea } from "./sea.js";
import { initStory } from "./story.js";
import { initSectionsA } from "./sections-a.js";
import { initSectionsB } from "./sections-b.js";
import { initThemes, initBackdrops, initReveals, initTilt, initIngredients, initChart, initStars, initSeals, initFaq, initShop, initNewsletter } from "./ui.js";

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
  initIntro(lenis);
  initSeals();
  initStars();
  initNav(lenis);
  initHero();

  // Pins first and in page order, so every ScrollTrigger below them measures the final layout
  await initStory();
  initSectionsA({ lenis }); // sections 5-10 (owns the How It Works pin)
  initSectionsB({ lenis }); // sections 11-16

  initSea();
  initThemes();
  initBackdrops();
  initReveals();
  initTilt();
  initIngredients();
  initChart();
  initFaq();
  initShop();
  initNewsletter();
  initCursor();

  // 3D scenes load lazily so the first paint stays light
  import("./molecule.js").then((m) => m.initMolecule(document.querySelector(".science__canvas"), document.querySelector(".science"))).catch(console.error);

  await document.fonts.ready;
  ScrollTrigger.refresh();
}

boot();
