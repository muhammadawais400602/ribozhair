import { defineConfig } from "vite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(root, "index.html");

// Motion versions of the same page. 1 = index.html itself (everything);
// 2 = clean design with a little motion; 3 = fades only.
// /v2/index.html and /v3/index.html are derived from index.html on every build / dev start,
// so the content can never drift between versions. They are generated files (git-ignored).
const VERSIONS = { v2: 2, v3: 3 };

function deriveVersion(html, mode) {
  const out = html.replace('<html lang="en" data-mode="1">', `<html lang="en" data-mode="${mode}">`);
  if (out === html) throw new Error("index.html no longer has <html lang=\"en\" data-mode=\"1\">, which vite.config.js needs to derive /v2 and /v3");
  return out;
}

function writeVersions() {
  const html = readFileSync(SOURCE, "utf8");
  for (const [dir, mode] of Object.entries(VERSIONS)) {
    mkdirSync(resolve(root, dir), { recursive: true });
    writeFileSync(resolve(root, dir, "index.html"), deriveVersion(html, mode));
  }
}

function motionVersions() {
  return {
    name: "ribozhair-motion-versions",
    config() { writeVersions(); },
    // the alternates point search engines back at the main page (added after Vite has resolved asset URLs)
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (!/<html[^>]*data-mode="[23]"/.test(html)) return html;
        return html.replace("</head>", '  <meta name="robots" content="noindex" />\n    <link rel="canonical" href="/" />\n  </head>');
      },
    },
    configureServer(server) {
      server.watcher.on("change", (file) => {
        if (resolve(file) === SOURCE) { writeVersions(); server.ws.send({ type: "full-reload" }); }
      });
    },
  };
}

export default defineConfig({
  plugins: [motionVersions()],
  build: {
    rollupOptions: {
      input: { main: SOURCE, v2: resolve(root, "v2/index.html"), v3: resolve(root, "v3/index.html") },
    },
  },
});
