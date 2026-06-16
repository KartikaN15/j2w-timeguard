// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isRender = process.env.RENDER === "true";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Outside Lovable (e.g. self-hosting on Render), override the Nitro preset to Node.js.
  // Inside a Lovable build this is ignored — Lovable forces cloudflare-module.
  ...(isRender && {
    nitro: { preset: "node-server" },
  }),
});
