import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

// Three separately designed pages, one per URL:
//   /     version 1 — all motion (index.html)
//   /v2/  version 2 — v2/index.html
//   /v3/  version 3 — v3/index.html (Tailwind, editorial structure)
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        v2: resolve(root, "v2/index.html"),
        v3: resolve(root, "v3/index.html"),
      },
    },
  },
});
