import { createFileRoute } from "@tanstack/react-router";

// Dev-preview only: stores the latest "check for update" nudge so the assistant can read it.
const FILE = "/tmp/veguto-update-nudge.json";
const off = () => new Response("Not found", { status: 404 });

export const Route = createFileRoute("/api/public/update-nudge")({
  server: {
    handlers: {
      GET: async () => {
        if (!import.meta.env.DEV) return off();
        const fs = await import("node:fs/promises");
        try { return new Response(await fs.readFile(FILE, "utf8"), { headers: { "content-type": "application/json" } }); }
        catch { return off(); }
      },
      POST: async ({ request }) => {
        if (!import.meta.env.DEV) return off();
        const text = await request.text();
        if (text.length > 2000) return new Response("Too large", { status: 413 });
        let data: Record<string, unknown>;
        try { data = JSON.parse(text); } catch { return new Response("Bad JSON", { status: 400 }); }
        const pick = (k: string) => (typeof data[k] === "string" ? (data[k] as string).slice(0, 100) : null);
        const fs = await import("node:fs/promises");
        await fs.writeFile(FILE, JSON.stringify({ status: pick("status"), local: pick("local"), remote: pick("remote"), at: pick("at") }));
        return new Response("ok");
      },
    },
  },
});
