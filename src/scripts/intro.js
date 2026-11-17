import "../styles/intro.css";

// Opening intro. The <head> script adds html.intro-on once per visit; CSS runs the show,
// this only locks scrolling, announces when the curtain opens, and cleans up.
export function initIntro(lenis) {
  const root = document.documentElement;
  const intro = document.getElementById("intro");
  const active = root.classList.contains("intro-on") && intro && getComputedStyle(intro).display !== "none";
  if (!active) {
    root.classList.remove("intro-on");
    intro?.remove();
    return false;
  }

  root.classList.add("intro-lock");
  lenis?.stop();
  scrollTo(0, 0);

  let opened = false, finished = false;
  const open = () => {
    if (opened) return;
    opened = true;
    dispatchEvent(new Event("ribo:intro-open")); // hero entrance starts as the curtain parts
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    open();
    root.classList.remove("intro-on", "intro-lock");
    intro.remove();
    lenis?.start();
  };

  const bot = intro.querySelector(".intro__panel--bot");
  bot.addEventListener("animationstart", (e) => e.animationName === "ipBot" && open());
  bot.addEventListener("animationend", (e) => e.animationName === "ipBot" && finish());
  setTimeout(open, 2300);
  setTimeout(finish, 4200); // safety net; CSS has already hidden it by then

  const skip = () => { if (!finished) intro.classList.add("is-out"); };
  intro.addEventListener("click", skip);
  addEventListener("keydown", (e) => e.key === "Escape" && skip(), { once: true });
  return true;
}
