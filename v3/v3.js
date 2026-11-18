import "./v3.css";

// Version 3: the only animation is opacity. Content fades in as it enters the viewport and out as it leaves.
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fades = [...document.querySelectorAll(".fade")];

if (reduced || !("IntersectionObserver" in window)) {
  fades.forEach((el) => el.classList.add("is-in"));
} else {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-in", e.isIntersecting)),
    { rootMargin: "-6% 0px -6% 0px", threshold: 0.08 },
  );
  fades.forEach((el) => io.observe(el));
}

// bag count (no checkout is wired yet)
const bag = document.querySelector("[data-bag]");
let count = 0;
document.querySelectorAll("[data-add]").forEach((b) =>
  b.addEventListener("click", () => {
    count += 1;
    bag.textContent = count;
    const label = b.textContent;
    b.textContent = "Added";
    setTimeout(() => (b.textContent = label), 1400);
  }),
);

// newsletter (client-side only; connect a backend before launch)
const form = document.querySelector("[data-news]");
const msg = document.querySelector("[data-news-msg]");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = form.querySelector("input");
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
  msg.textContent = ok ? "Thanks — you're on the list." : "Please enter a valid email address.";
  if (ok) input.value = "";
});
