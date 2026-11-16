import { createServerFn } from "@tanstack/react-start";

const MAX_BYTES = 10 * 1024 * 1024;

const sniffMime = (bytes: Uint8Array): string | null => {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  return null;
};

/** Downloads an image server-side (avoids browser CORS) and returns it as a base64 data URL
 *  so it keeps working forever instead of relying on a remote link. */
export const fetchImageAsBase64 = createServerFn({ method: "POST" })
  .inputValidator((d: { url: string }) => d)
  .handler(async ({ data }) => {
    let target: URL;
    try {
      target = new URL(data.url);
    } catch {
      return { ok: false as const, error: "الرابط غير صالح." };
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return { ok: false as const, error: "مسموح فقط بروابط http/https." };
    }
    try {
      const res = await fetch(target, {
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VegutoWikiStudio/1.0)", Accept: "image/*,*/*;q=0.8" },
      });
      if (!res.ok) return { ok: false as const, error: `الخادم رد بالخطأ ${res.status}.` };
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength === 0) return { ok: false as const, error: "الملف فارغ." };
      if (buf.byteLength > MAX_BYTES) return { ok: false as const, error: "حجم الصورة أكبر من 10MB." };
      const headerType = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
      const mime = headerType.startsWith("image/") ? headerType : sniffMime(buf) ?? "";
      if (!mime) return { ok: false as const, error: "الرابط لا يشير إلى صورة." };
      const base64 = Buffer.from(buf).toString("base64");
      return { ok: true as const, dataUrl: `data:${mime};base64,${base64}` };
    } catch {
      return { ok: false as const, error: "تعذر تحميل الصورة من الرابط." };
    }
  });
