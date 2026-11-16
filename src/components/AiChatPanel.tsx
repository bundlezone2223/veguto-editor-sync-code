import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { ArrowUp, Bot, ListTree, Languages, Tags, PenLine, Copy, Check, RotateCcw, SquarePen, Loader2, CheckCircle2, XCircle, ChevronDown, Globe, ShieldCheck, FileText } from "lucide-react";
import { agentPlan, agentResearch, agentWrite, agentReview, type AgentArticle } from "@/lib/agent.functions";

type Step = { label: string; status: "run" | "ok" | "fail"; detail?: string };
type Review = { score: number; verdict: string; unsupported: string[]; issues: string[]; summary: string };
type Msg = { role: "user" | "assistant"; content: string; error?: boolean; steps?: Step[]; sources?: { title: string; url: string }[]; review?: Review | null; applied?: boolean };

function StepsCard({ steps, running }: { steps: Step[]; running: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-3 rounded-xl border border-border bg-background">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground">
        {running ? <Loader2 size={14} className="animate-spin text-accent-pink" /> : <CheckCircle2 size={14} className="text-accent-pink" />}
        {running ? "الوكيل يعمل..." : `اكتملت ${steps.length} مراحل`}
        <ChevronDown size={14} className={`ms-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ol className="space-y-1.5 border-t border-border px-3 py-2">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-xs">
              {s.status === "run" ? <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-accent-pink" /> : s.status === "ok" ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-accent-pink" /> : <XCircle size={13} className="mt-0.5 shrink-0 text-destructive" />}
              <div className="min-w-0"><p className="font-medium">{s.label}</p>{s.detail && <p dir="auto" className="text-muted-foreground break-words">{s.detail}</p>}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const quick = [
  { icon: <ListTree size={16} />, label: "اقترح هيكل المقال", prompt: "اقترح هيكلاً كاملاً للمقال (h2/h3) بناءً على العنوان والمحتوى الحالي." },
  { icon: <PenLine size={16} />, label: "اكتب مقالاً كاملاً", prompt: "ابحث واكتب مقالاً كاملاً بالإنجليزية عن موضوع عنوان المقال الحالي." },
  { icon: <Languages size={16} />, label: "ترجم للإنجليزية", prompt: "ترجم محتوى المقال الحالي إلى الإنجليزية بأسلوب ويكي احترافي." },
  { icon: <Tags size={16} />, label: "اقترح وسوماً", prompt: "اقترح تصنيفاً واحداً و5 وسوم إنجليزية مناسبة للمقال." },
];

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* ignore */ } }}
      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      title="نسخ"
    >
      {ok ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export function AiChatPanel({ articleId, context, onApply }: { articleId: string; context: string; onApply: (a: AgentArticle) => void }) {
  const storeKey = `veguto-chat-${articleId}`;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const plan = useServerFn(agentPlan);
  const research = useServerFn(agentResearch);
  const write = useServerFn(agentWrite);
  const review = useServerFn(agentReview);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Load saved conversation once (client only).
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storeKey) || "[]");
      setMessages(Array.isArray(raw) ? raw.filter((m) => m && typeof m.content === "string") : []);
    } catch { setMessages([]); }
    setLoaded(true);
  }, [storeKey]);

  useEffect(() => {
    if (loaded) localStorage.setItem(storeKey, JSON.stringify(messages));
  }, [messages, storeKey, loaded]);

  // Keep the newest message in view without scrolling the whole page.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const resize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  };
  useEffect(resize, [input]);

  const patchLast = (f: (m: Msg) => Msg) => setMessages((all) => { const c = [...all]; const last = c[c.length - 1]; if (last) c[c.length - 1] = f(last); return c; });
  const setStep = (i: number, st: Step) => patchLast((m) => { const steps = [...(m.steps ?? [])]; steps[i] = st; return { ...m, steps }; });

  const run = async (history: Msg[]) => {
    setBusy(true);
    const msgs = history.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    const instruction = msgs[msgs.length - 1]?.content ?? "";
    setMessages((m) => [...m, { role: "assistant", content: "", steps: [{ label: "تحليل الطلب وتحديد النية", status: "run" }] }]);
    const fail = (i: number, label: string, err: string) => { setStep(i, { label, status: "fail", detail: err }); patchLast((m) => ({ ...m, content: err, error: true })); };
    try {
      const p = await plan({ data: { messages: msgs, context } });
      if (p.error || !p.plan) return fail(0, "تحليل الطلب", p.error ?? "فشل");
      const P = p.plan;
      if (P.intent === "chat") {
        setStep(0, { label: "تحليل الطلب", status: "ok", detail: "محادثة مباشرة" });
        patchLast((m) => ({ ...m, content: P.reply || "..." }));
        return;
      }
      setStep(0, { label: P.intent === "write" ? "تحليل: مقال جديد" : "تحليل: تعديل المقال", status: "ok", detail: P.plan });
      let sources: { title: string; url: string; content: string }[] = [], answers: string[] = [];
      let n = 1;
      if (P.queries.length) {
        setStep(n, { label: `البحث في الويب (${P.queries.length} استعلامات)`, status: "run", detail: P.queries.join(" · ") });
        const r = await research({ data: { queries: P.queries } });
        sources = r.sources; answers = r.answers;
        setStep(n, { label: "البحث في الويب", status: r.error ? "fail" : "ok", detail: r.error ?? `تم جلب ${sources.length} مصدراً` });
        n++;
      }
      const wi = n++;
      setStep(wi, { label: "تخطيط الهيكل وكتابة المقال", status: "run" });
      let w = await write({ data: { intent: P.intent, instruction, topic: P.topic, language: P.language, angles: P.angles, context, sources, answers } });
      if (w.error || !w.article) return fail(wi, "الكتابة", w.error ?? "فشل");
      setStep(wi, { label: "تخطيط الهيكل وكتابة المقال", status: "ok", detail: `${w.article.sections.length} قسماً · ${w.article.title}` });
      const ri = n++;
      setStep(ri, { label: "التدقيق المستقل والتقييم", status: "run" });
      let rv = await review({ data: { article: w.article, sources, answers } });
      if (rv.review && rv.review.verdict !== "ready" && rv.review.score < 80) {
        setStep(ri, { label: `التدقيق: ${rv.review.score}/100 — يحتاج إصلاح`, status: "ok", detail: rv.review.summary });
        const fi = n++;
        setStep(fi, { label: "إصلاح الملاحظات", status: "run" });
        const feedback = [...rv.review.unsupported.map((x) => `Unsupported: ${x}`), ...rv.review.issues].join("\n");
        const w2 = await write({ data: { intent: "edit", instruction: "Fix all reviewer issues; remove unsupported claims.", topic: P.topic, language: P.language, angles: P.angles, context: w.article.sections.map((s) => JSON.stringify(s)).join("\n"), sources, answers, feedback } });
        if (w2.article) { w = w2; rv = await review({ data: { article: w2.article, sources, answers } }); }
        setStep(fi, { label: "إصلاح الملاحظات", status: w2.article ? "ok" : "fail" });
      }
      if (rv.review) setStep(ri, { label: `التقييم النهائي: ${rv.review.score}/100`, status: "ok", detail: rv.review.summary });
      onApply(w.article!);
      patchLast((m) => ({ ...m, content: `تم تطبيق المقال **${w.article!.title}** في المحرر.`, sources: sources.map(({ title, url }) => ({ title, url })), review: rv.review, applied: true }));
    } catch {
      patchLast((m) => ({ ...m, content: "تعذر الاتصال بالوكيل. حاول مرة أخرى.", error: true }));
    } finally { setBusy(false); }
  };

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...messages, { role: "user" as const, content: t }];
    setMessages(next);
    setInput("");
    void run(next);
  };

  const retry = () => {
    if (busy) return;
    const base = messages.slice(0, messages[messages.length - 1]?.role === "assistant" ? -1 : undefined);
    setMessages(base);
    void run(base);
  };

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100dvh-6.5rem)] -mx-3 md:mx-0 rounded-none md:rounded-2xl bg-card md:border border-border overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-4 h-12 border-b border-border">
        <div className="grid h-7 w-7 place-items-center rounded-full bg-accent-pink text-primary-foreground"><Bot size={15} /></div>
        <p className="text-sm font-bold">وكيل فيجوتو</p>
        <span className="text-[11px] text-muted-foreground">· Gemini</span>
        {!empty && (
          <button onClick={() => !busy && setMessages([])} title="محادثة جديدة" className="ms-auto grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <SquarePen size={16} />
          </button>
        )}
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
          {empty ? (
            <div className="pt-[10vh] text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted text-accent-pink"><Bot size={26} /></div>
              <h2 className="text-xl font-bold mb-1">كيف أساعدك في مقالك؟</h2>
              <p className="text-sm text-muted-foreground mb-8">أرى عنوان المقال وأقسامه الحالية.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-right">
                {quick.map((q) => (
                  <button key={q.label} onClick={() => send(q.prompt)} className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm hover:border-accent-pink hover:text-accent-pink transition-colors">
                    <span className="text-accent-pink">{q.icon}</span>{q.label}
                  </button>
                ))}
              </div>
            </div>
          ) : messages.map((m, i) => m.role === "user" ? (
            <div key={i} className="flex justify-start">
              <div dir="auto" className="max-w-[85%] rounded-3xl bg-muted px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="group flex gap-3">
              <div className="shrink-0 mt-0.5 grid h-7 w-7 place-items-center rounded-full border border-border text-accent-pink"><Bot size={14} /></div>
              <div className="min-w-0 flex-1">
                {m.steps && <StepsCard steps={m.steps} running={busy && i === messages.length - 1} />}
                {m.error ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive flex items-center gap-2">
                    {m.content}
                    {i === messages.length - 1 && <button onClick={retry} className="ms-auto flex items-center gap-1 text-xs underline"><RotateCcw size={12} /> إعادة</button>}
                  </div>
                ) : (
                  <>
                    {m.content && <div dir="auto" className="chat-md text-sm leading-7 break-words"><ReactMarkdown>{m.content}</ReactMarkdown></div>}
                    {m.review && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl border border-border bg-background p-3 text-xs">
                        <ShieldCheck size={16} className="shrink-0 text-accent-pink" />
                        <div><p className="font-bold">{m.review.score}/100 · {m.review.verdict === "ready" ? "جاهز للنشر" : "يحتاج مراجعة"}</p>
                        {m.review.issues.length > 0 && <ul className="mt-1 list-disc ps-4 text-muted-foreground" dir="auto">{m.review.issues.slice(0, 5).map((x, k) => <li key={k}>{x}</li>)}</ul>}</div>
                      </div>
                    )}
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.sources.slice(0, 10).map((s2, k) => (
                          <a key={k} href={s2.url} target="_blank" rel="noreferrer" className="flex max-w-[220px] items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-accent-pink">
                            <Globe size={11} className="shrink-0" /><span className="truncate">{s2.title || new URL(s2.url).hostname}</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {m.applied && <p className="mt-2 flex items-center gap-1 text-xs text-accent-pink"><FileText size={12} /> افتح تبويب المحرر لرؤية المقال</p>}
                    <div className="mt-1 flex gap-1 opacity-70">
                      <CopyBtn text={m.content} />
                      {i === messages.length - 1 && (
                        <button onClick={retry} title="إعادة التوليد" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><RotateCcw size={14} /></button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
          {busy && !messages[messages.length - 1]?.steps && (
            <div className="flex gap-3 items-center">
              <div className="shrink-0 grid h-7 w-7 place-items-center rounded-full border border-border text-accent-pink"><Bot size={14} /></div>
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-accent-pink animate-bounce [animation-delay:-0.3s]" />
                <span className="h-2 w-2 rounded-full bg-accent-pink animate-bounce [animation-delay:-0.15s]" />
                <span className="h-2 w-2 rounded-full bg-accent-pink animate-bounce" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 bg-card px-3 pb-3 pt-2">
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="mx-auto max-w-3xl rounded-3xl border border-border bg-background p-2 flex items-end gap-2 focus-within:border-accent-pink transition-colors"
        >
          <textarea
            ref={taRef} dir="auto" rows={1} value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
            placeholder="اسأل وكيل فيجوتو..."
            className="flex-1 resize-none bg-transparent outline-none px-3 py-2 text-base md:text-sm leading-6"
          />
          <button type="submit" disabled={busy || !input.trim()} title="إرسال" className="shrink-0 grid h-9 w-9 place-items-center rounded-full bg-accent-pink text-primary-foreground disabled:opacity-30 transition-opacity">
            <ArrowUp size={18} />
          </button>
        </form>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">قد يخطئ الوكيل، راجع النص قبل اعتماده.</p>
      </div>
    </div>
  );
}
