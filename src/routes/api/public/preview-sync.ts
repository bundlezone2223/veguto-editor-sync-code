import { createFileRoute } from "@tanstack/react-router";

// Dev-preview only mirror (see src/lib/preview-sync.ts). Disabled in production builds.
const DIR = "/tmp/veguto-preview-sync";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const HASH_RE = /^[a-f0-9]{32}$/;
const off = () => new Response("Not found", { status: 404 });

async function fs() {
  const m = await import("node:fs/promises");
  await m.mkdir(`${DIR}/img`, { recursive: true });
  return m;
}

export const Route = createFileRoute("/api/public/preview-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!import.meta.env.DEV) return off();
        const url = new URL(request.url);
        const f = await fs();
        const img = url.searchParams.get("img");
        if (img) {
          if (!HASH_RE.test(img)) return off();
          try {
            const dataUrl = await f.readFile(`${DIR}/img/${img}`, "utf8");
            const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
            if (!m) return off();
            return new Response(Buffer.from(m[2] ?? "", "base64"), { headers: { "content-type": m[1] ?? "image/jpeg", "cache-control": "max-age=31536000, immutable" } });
          } catch { return off(); }
        }
        let id = url.searchParams.get("id") ?? "";
        try {
          if (!id || id === "latest") id = (await f.readFile(`${DIR}/latest`, "utf8")).trim();
          if (!ID_RE.test(id)) return off();
          return new Response(await f.readFile(`${DIR}/${id}.json`, "utf8"), { headers: { "content-type": "application/json" } });
        } catch { return off(); }
      },
      POST: async ({ request }) => {
        if (!import.meta.env.DEV) return off();
        const url = new URL(request.url);
        const f = await fs();
        const img = url.searchParams.get("img");
        if (img) {
          const body = await request.text();
          if (!HASH_RE.test(img) || !body.startsWith("data:image/") || body.length > 30_000_000) return new Response("Bad image", { status: 400 });
          await f.writeFile(`${DIR}/img/${img}`, body);
          return new Response("ok");
        }
        const text = await request.text();
        if (text.length > 5_000_000) return new Response("Too large", { status: 413 });
        let project: { id?: unknown };
        try { project = JSON.parse(text); } catch { return new Response("Bad JSON", { status: 400 }); }
        if (typeof project.id !== "string" || !ID_RE.test(project.id)) return new Response("Bad id", { status: 400 });
        await f.writeFile(`${DIR}/${project.id}.json`, text);
        await f.writeFile(`${DIR}/latest`, project.id);
        return new Response("ok");
      },
    },
  },
});
