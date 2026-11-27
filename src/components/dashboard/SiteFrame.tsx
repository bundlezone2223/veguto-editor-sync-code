import { useEffect, useRef, useState } from "react";
import { ExternalLink, Maximize2, Minimize2, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { GhostButton } from "./ui";

/** The merged main site (/site) shown live in a frame, with a full-screen mode. */
export function SiteFrame() {
  const ref = useRef<HTMLIFrameElement>(null);
  const [full, setFull] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  return (
    <div className={full ? "fixed inset-0 z-50 flex flex-col gap-2 bg-background p-2" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-1.5">
        <GhostButton onClick={() => setMobile(false)} ariaLabel="شاشة مكتبية"><Monitor size={15} /></GhostButton>
        <GhostButton onClick={() => setMobile(true)} ariaLabel="شاشة هاتف"><Smartphone size={15} /></GhostButton>
        <GhostButton onClick={() => ref.current?.contentWindow?.location.reload()} ariaLabel="إعادة تحميل الموقع"><RefreshCw size={15} /></GhostButton>
        <a href="/site" target="_blank" rel="noreferrer" aria-label="فتح في نافذة مستقلة" className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"><ExternalLink size={15} /></a>
        <button type="button" onClick={() => setFull((f) => !f)} className="ms-auto inline-flex items-center gap-1.5 rounded-md bg-accent-pink px-3 py-1.5 text-sm text-card">
          {full ? <><Minimize2 size={15} /> إغلاق الشاشة الكاملة</> : <><Maximize2 size={15} /> شاشة كاملة</>}
        </button>
      </div>
      <div className={`flex justify-center rounded-lg border border-border bg-muted/40 ${full ? "min-h-0 flex-1" : ""}`}>
        <iframe
          ref={ref}
          src="/site"
          title="الموقع الرئيسي"
          className={`bg-white transition-all ${mobile ? "w-[390px]" : "w-full"} ${full ? "h-full" : "h-[75vh]"}`}
        />
      </div>
    </div>
  );
}
