// Local fixture acceptance only; never imported by the production app.
import { createServer } from "vite";
const server = await createServer({
  configFile: false,
  resolve: { alias: { "@": process.cwd(), "next/navigation": "virtual:fixture-navigation" } },
  optimizeDeps: { exclude: ["next/navigation"] }, esbuild: { jsx: "automatic" }, define: { "process.env": {} },
  server: { host: "127.0.0.1", port: 3104, strictPort: true, watch: { ignored: ["**/.next/**"] } },
  plugins: [{ name: "phase4-preview", enforce: "pre",
    resolveId(id) { if (id === "virtual:fixture-navigation") return id; },
    load(id) { if (id === "virtual:fixture-navigation") return 'export const usePathname = () => "/";'; },
    configureServer(s) { s.middlewares.use(async (req,res,next) => {
      if (req.url !== "/") return next(); res.setHeader("Content-Type", "text/html");
      res.end(await s.transformIndexHtml("/", '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 4 fixture acceptance</title><div id="root"></div><script type="module" src="/tests/visual-preview.tsx"></script></html>'));
    }); }
  }]
});
await server.listen(); console.log("Phase 4 fixture preview: http://127.0.0.1:3104");
