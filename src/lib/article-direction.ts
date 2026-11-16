/** Detects article direction from its text: RTL when Arabic letters dominate, else LTR. */
export function detectArticleDir(texts: string[]): "rtl" | "ltr" {
  let ar = 0, lat = 0;
  for (const t of texts) {
    ar += (t.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) ?? []).length;
    lat += (t.match(/[A-Za-z]/g) ?? []).length;
  }
  if (ar === 0 && lat === 0) return "rtl";
  return ar >= lat ? "rtl" : "ltr";
}
