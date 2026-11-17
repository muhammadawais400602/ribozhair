import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// resolved at build time; empty until the video files exist
const files = import.meta.glob("../assets/video/*.{mp4,webm}", { eager: true, query: "?url", import: "default" });
const pick = (name) => files[`../assets/video/${name}`];
const webm = pick("sea.webm"), webm720 = pick("sea-720.webm"), mp4 = pick("sea.mp4"), mp4m = pick("sea-m.mp4");

// One sea video behind the whole page; a light frost fades in once the reading sections begin.
export function initSea() {
  const video = document.querySelector(".sea-bg__video");
  const frost = document.querySelector(".sea-bg__frost");
  if (!video) return;
  const small = matchMedia("(max-width: 760px)").matches;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 720p is indistinguishable behind the frost up to laptop sizes; 1080p only on large screens
  const laptop = innerWidth * Math.min(devicePixelRatio || 1, 2) <= 1800;
  const vp9 = video.canPlayType('video/webm; codecs="vp9"');
  const src = small ? mp4m || mp4 : laptop ? (vp9 && webm720) || mp4m || mp4 : (vp9 && webm) || mp4;
  if (!reduced && src) {
    // poster paints first; the video is fetched once the page has loaded and the browser is idle
    const start = () => {
      video.src = src;
      const play = () => video.play().catch(() => {});
      play();
      document.addEventListener("visibilitychange", () => (document.hidden ? video.pause() : play()));
    };
    const idle = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 600));
    if (document.readyState === "complete") idle();
    else addEventListener("load", idle, { once: true });
  }
  const first = document.querySelector(".science");
  if (first) gsap.fromTo(frost, { opacity: 0 }, { opacity: 1, ease: "none", scrollTrigger: { trigger: first, start: "top bottom", end: "top 35%", scrub: true } });
}
