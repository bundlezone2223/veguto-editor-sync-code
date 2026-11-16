import { useState } from "react";

/** Card thumbnail ratio used by the public wiki cards. */
export const CARD_RATIO = 2.037;

/**
 * Shows the full image with a 2.037:1 frame marking what the cards will show.
 * Preview only — the image itself is never cropped.
 */
export function ThumbnailFramePreview({ src, onClose }: { src: string; onClose: () => void }) {
  const [ratio, setRatio] = useState<number | null>(null);

  let frame = { w: 100, h: 100 };
  if (ratio) {
    frame = ratio > CARD_RATIO
      ? { w: (CARD_RATIO / ratio) * 100, h: 100 }
      : { w: 100, h: (ratio / CARD_RATIO) * 100 };
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70-sm" onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">كيف ستظهر الصورة في البطاقات</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center">✕</button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          الإطار يوضح الجزء الظاهر في البطاقات بنسبة 2.037:1. الصورة لن تُقص، وستظهر كاملة داخل المقال.
        </p>

        <div className="flex justify-center bg-muted/40 rounded-lg p-2">
          <div className="relative inline-block overflow-hidden rounded-md">
            <img
              src={src}
              alt="معاينة الصورة المصغرة"
              className="block max-w-full max-h-[60vh] w-auto h-auto"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
              }}
            />
            {ratio && (
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-accent-pink rounded-sm pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                style={{ width: `${frame.w}%`, height: `${frame.h}%` }}
              >
                <span className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-accent-pink text-white" dir="ltr">2.037 : 1</span>
              </div>
            )}
          </div>
        </div>

        {ratio && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground mb-1">معاينة البطاقة</p>
            <div className="w-64 max-w-full rounded-lg overflow-hidden border border-border" style={{ aspectRatio: `${CARD_RATIO} / 1` }}>
              <img src={src} alt="" className="w-full h-full object-cover" />
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="text-sm px-5 py-2 rounded-lg bg-accent-pink text-white hover:opacity-90">تم</button>
        </div>
      </div>
    </div>
  );
}
