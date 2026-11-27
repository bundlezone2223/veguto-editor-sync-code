import type { Plugin, ViteDevServer } from "vite";
import { createServer } from "vite";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SiteWorkspace } from "./site-workspace";

/** Node-only dev middleware: filesystem access never enters the published Worker. */
export function siteDevPlugin(): Plugin {
  let preview: ViteDevServer | null = null, pendingPreview: Promise<ViteDevServer> | null = null;
  const key = randomBytes(32).toString("hex");
  return {
    name: "veguto-local-site", apply: "serve",
    configureServer(server) {
      const workspace = new SiteWorkspace(server.config.root);
      const startPreview = () => {
        if (preview) return Promise.resolve(preview);
        if (pendingPreview) return pendingPreview;
        pendingPreview = (async () => {
          const runtime = path.join(server.config.root, "node_modules/.cache/veguto-site-preview"); await mkdir(runtime, { recursive: true });
          await writeFile(path.join(runtime, "main.tsx"), `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport { RouterProvider } from "@tanstack/react-router";\nimport { getRouter } from ${JSON.stringify(path.join(workspace.root, "src/router.tsx"))};\nimport ${JSON.stringify(path.join(workspace.root, "src/styles.css"))};\nconst el=document.getElementById("root"); if(el) createRoot(el).render(<RouterProvider router={getRouter()} />);`);
          const [{ default: react }, { default: tailwind }, { tanstackRouter }] = await Promise.all([import("@vitejs/plugin-react"), import("@tailwindcss/vite"), import("@tanstack/router-plugin/vite")]);
          preview = await createServer({
            configFile: false, root: workspace.root, base: "/api/site-preview/", appType: "custom", logLevel: "error", cacheDir: path.join(runtime, "cache"),
            optimizeDeps: { entries: [path.join(runtime, "main.tsx")], holdUntilCrawlEnd: true },
            plugins: [
              tanstackRouter({ target: "react", routesDirectory: path.join(workspace.root, "src/routes"), generatedRouteTree: path.join(workspace.root, "src/routeTree.gen.ts"), autoCodeSplitting: false }),
              react(), tailwind(),
              { name: "preview-basepath", transform(code, id) {
                const file = id.split("?")[0];
                if (file === path.join(workspace.root, "src/router.tsx")) return code.replace(/createRouter\s*\(\s*\{/, 'createRouter({ basepath: "/api/site-preview",');
                // The preview already supplies its document shell; the site's SSR shell is not a nested React element.
                if (file === path.join(workspace.root, "src/routes/__root.tsx")) return code.replace(/shellComponent:\s*\w+\s*,/, "");
                return null;
              } },
            ],
            resolve: { alias: { "@": path.join(workspace.root, "src") }, dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"] },
            server: { middlewareMode: true, hmr: false, cors: true, fs: { allow: [workspace.root, runtime, path.join(server.config.root, "node_modules")] } },
          });
          return preview;
        })().finally(() => { pendingPreview = null; });
        return pendingPreview;
      };
      const stopPreview = async () => { if (pendingPreview) await pendingPreview.catch(() => undefined); if (preview) { await preview.close(); preview = null; } };
      server.httpServer?.once("close", () => { void stopPreview(); });
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/site-workspace") && !url.pathname.startsWith("/api/site-preview")) return next();
        const json = (status: number, value: unknown) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(value)); };
        try {
          if (url.pathname.startsWith("/api/site-preview")) {
            if (req.method !== "GET" && req.method !== "HEAD") return json(405, { error: "المعاينة للقراءة فقط" });
            if (!await workspace.state()) return json(409, { error: "اسحب الموقع أولًا" });
            const p = await startPreview();
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups allow-modals; connect-src *; frame-ancestors 'self'");
            const relative = url.pathname.slice("/api/site-preview".length);
            if (!relative || relative === "/" || (!relative.includes(".") && !relative.startsWith("/@") && !relative.startsWith("/src/") && !relative.startsWith("/node_modules/"))) {
              const entry = `/@fs${path.join(server.config.root, "node_modules/.cache/veguto-site-preview/main.tsx")}`;
              const html = await p.transformIndexHtml(url.pathname, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&family=Quicksand:wght@300;400;500;600;700&display=swap"></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`);
              res.setHeader("content-type", "text/html; charset=utf-8"); res.end(html); return;
            }
            return p.middlewares(req, res, () => { res.statusCode = 404; res.end("Not found"); });
          }
          if (url.pathname === "/api/site-workspace/session" && req.method === "GET") {
            if (req.headers.origin === "null" || req.headers["sec-fetch-site"] === "cross-site") return json(403, { error: "غير مسموح" });
            return json(200, { key });
          }
          if (req.method !== "POST" || req.headers["x-site-workspace-key"] !== key) return json(403, { error: "غير مسموح" });
          let body = ""; for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 25 * 1024 * 1024) return json(413, { error: "التعديلات أكبر من الحد المسموح" }); }
          const d = JSON.parse(body || "{}"); const action = url.pathname.slice("/api/site-workspace/".length);
          if (action === "status") return json(200, await workspace.status());
          if (action === "read" && typeof d.path === "string") return json(200, await workspace.text(d.path));
          if (action === "pull" && (d.revision === undefined || typeof d.revision === "string")) { await stopPreview(); return json(200, await workspace.pull(d.revision)); }
          if (action === "apply" && typeof d.revision === "string" && d.files && d.drafts) { await stopPreview(); return json(200, await workspace.apply(d.revision, d.files, d.drafts)); }
          if (action === "publish" && typeof d.message === "string" && typeof d.revision === "string") return json(200, await workspace.publish(d.message, d.revision));
          return json(400, { error: "طلب غير صالح" });
        } catch (e) { return json(400, { error: e instanceof Error ? e.message : "تعذرت العملية" }); }
      });
    },
  };
}