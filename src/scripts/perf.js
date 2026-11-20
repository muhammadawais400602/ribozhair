// Auto-quality: if the device cannot hold ~35 fps while the user scrolls, drop to a lighter rendering mode.
// Sampling only counts frames during scrolling, so an idle page never triggers it.
export function initPerf() {
  const root = document.documentElement;
  window.__riboQuality = "high";
  const q = new URLSearchParams(location.search).get("perf"); // ?perf=off never downgrades, ?perf=lite forces the light mode
  if (q === "off") return;
  let lastScroll = 0, last = 0, samples = [], bad = 0, started = performance.now(), done = false;
  addEventListener("scroll", () => { lastScroll = performance.now(); }, { passive: true });

  const lite = () => {
    if (done) return;
    done = true;
    window.__riboQuality = "lite";
    root.classList.add("perf-lite");
    const v = document.querySelector(".sea-bg__video");
    if (v) v.pause(); // the poster/last frame stays; saves continuous video decode + recomposite
    dispatchEvent(new Event("ribo:quality"));
  };

  const frame = (t) => {
    if (done) return;
    const dt = t - last; last = t;
    const scrolling = t - lastScroll < 300;
    if (scrolling && dt > 0 && dt < 500 && t - started > 4000 && !document.hidden) {
      samples.push(dt);
      if (samples.length >= 90) {
        samples.sort((a, b) => a - b);
        const median = samples[Math.floor(samples.length / 2)];
        bad = median > 30 ? bad + 1 : 0;
        samples = [];
        if (bad >= 2) return lite();
      }
    }
    requestAnimationFrame(frame);
  };
  if (q === "lite") { setTimeout(lite, 300); return; }
  requestAnimationFrame(frame);
}
