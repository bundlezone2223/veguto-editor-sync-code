import { detectArticleDir } from "@/lib/article-direction";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { needsClearBefore, planImageLayouts, type ImageLayout } from "@/lib/image-layout";
import { ArrowLeft, Heading2, Heading3, Pilcrow, List, Quote, Image as ImageIcon, Lightbulb, Images, ImagePlus, Copy, Download, PenLine, Bot, MoreHorizontal, Code2, Info, ClipboardPaste, Bold, Terminal, Undo2, Cloud, CloudOff, Loader2 } from "lucide-react";
import { ArticleImportDialog } from "@/components/ArticleImportDialog";
import { TextImportDialog } from "@/components/TextImportDialog";
import { JsonImagesDialog } from "@/components/JsonImagesDialog";
import { CommandsDialog } from "@/components/CommandsDialog";
import { AiChatPanel } from "@/components/AiChatPanel";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WikiLayout } from "@/components/WikiLayout";
import { ProjectMetaModal, type ProjectMetaValues } from "@/components/ProjectMetaModal";
import type { Section } from "@/lib/article-content";
import { getProject, upsertProject, newArticleId, type Meta, type Project } from "@/lib/projects-store";
import { pullPreview, pushPreview } from "@/lib/preview-sync";
import { articleFileName } from "@/lib/article-file-name";
import { buildArticleTs } from "@/lib/article-ts";
import { autoSaveArticle } from "@/lib/article-library";
import { editableText, inlineBoldHtml } from "@/lib/inline-bold";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/studio/$id")({
  head: () => ({
    meta: [
      { title: "المحرر | Veguto Wiki Studio" },
      { name: "description", content: "حرّر محتوى المقال وبياناته في Veguto Wiki Studio." },
      { property: "og:title", content: "المحرر | Veguto Wiki Studio" },
      { property: "og:description", content: "حرّر محتوى المقال وبياناته في Veguto Wiki Studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudioPage,
});

const emptySection = (type: Section["type"]): Section => {
  switch (type) {
    case "h2": return { type: "h2", text: "" };
    case "h3": return { type: "h3", text: "" };
    case "p": return { type: "p", text: "" };
    case "emphasis": return { type: "emphasis", text: "" };
    case "list": return { type: "list", ordered: false, items: [""] };
    case "quote": return { type: "quote", text: "", cite: "" };
    case "image": return { type: "image", src: "", alt: "", caption: "" };
    case "callout": return { type: "callout", title: "", text: "" };
  }
};

const headingPattern = /^\s*[•·●⦁]{1,3}\s*(.+?)\s*[•·●⦁]{1,3}\s*$/;

/** Turns text containing ••عنوان•• lines into h3 + paragraph sections. Returns null when nothing matches. */
function parseHeadingText(text: string): Section[] | null {
  const lines = text.replace(/\r/g, "").split("\n");
  if (!lines.some((line) => headingPattern.test(line))) return null;

  const parsed: Section[] = [];
  let paragraphLines: string[] = [];
  const flush = () => {
    const paragraph = paragraphLines.join("\n").trim();
    if (paragraph) parsed.push({ type: "p", text: paragraph });
    paragraphLines = [];
  };

  lines.forEach((line) => {
    const headingText = line.match(headingPattern)?.[1];
    if (headingText) {
      flush();
      parsed.push({ type: "h3", text: headingText.trim() });
    } else if (line.trim() || paragraphLines.length > 0) {
      paragraphLines.push(line);
    }
  });
  flush();
  return parsed.length > 0 ? parsed : null;
}

const btnCls = "text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors";
const pillCls = "text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-[oklch(0.97_0.03_350)] hover:text-accent-pink transition-colors";
const editableCls = "outline-none focus:ring-2 focus:ring-accent-pink/40 rounded-md px-1 -mx-1 transition-shadow hover:bg-muted/40";

function escapeHtml(s: string) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

function Editable({
  value, onChange, as = "span", className = "", placeholder = "", multiline = false, onFocus, onPaste, onEmptyBackspace,
}: {
  value: string; onChange: (v: string) => void;
  as?: "span" | "div" | "h1" | "h2" | "h3" | "h4" | "p";
  className?: string; placeholder?: string; multiline?: boolean;
  onFocus?: () => void;
  onPaste?: (text: string, event: React.ClipboardEvent<HTMLElement>) => void;
  onEmptyBackspace?: () => void;
}) {
  const Tag = as as any;
  return (
    <Tag
      contentEditable suppressContentEditableWarning data-placeholder={placeholder}
      className={`${editableCls} ${className} empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/60`}
      onFocus={onFocus}
      onPaste={(e: React.ClipboardEvent<HTMLElement>) => onPaste?.(e.clipboardData.getData("text"), e)}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const source = editableText(e.currentTarget);
        const t = multiline ? source : source.replace(/\n/g, " ");
        if (t !== value) onChange(t);
        e.currentTarget.innerHTML = inlineBoldHtml(t);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (!multiline && e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
        if (e.key === "Backspace" && onEmptyBackspace && e.currentTarget.innerText.trim() === "") {
          e.preventDefault();
          onEmptyBackspace();
        }
      }}
      dangerouslySetInnerHTML={{ __html: inlineBoldHtml(value) }}
    />
  );
}

function InlineSection({
  s, index, layout, onImageRatio, onChange, onRemove, onMoveUp, onMoveDown, onActivate, onParagraphPaste,
}: {
  s: Section;
  layout: ImageLayout | null;
  onImageRatio: (src: string, ratio: number) => void;
  index: number;
  onChange: (patch: Partial<Section>) => void;
  onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
  onActivate: () => void;
  onParagraphPaste: (text: string, event: React.ClipboardEvent<HTMLElement>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const Toolbar = (
    <div className="absolute -top-3 left-2 hidden group-hover:flex group-focus-within:flex gap-1 bg-card border border-border rounded-md shadow px-1 py-0.5 z-10">
      <button className={btnCls} onClick={onMoveUp} title="أعلى">↑</button>
      <button className={btnCls} onClick={onMoveDown} title="أسفل">↓</button>
      <button className={btnCls} onClick={onRemove} title="حذف">✕</button>
      <span className="text-[10px] font-mono uppercase text-accent-pink px-1 self-center">{s.type}</span>
    </div>
  );

  const wrap = (children: React.ReactNode, extra = "") => (
    <div className={`relative group my-2 ${extra}`} data-section-index={index} onFocusCapture={onActivate}>{Toolbar}{children}</div>
  );
  // Image placement is planned by the article (see planImageLayouts) so tall images never stack or leave gaps.
  const hasSrc = s.type === "image" && !!s.src;
  const figureCls =
    !hasSrc || !layout || layout.kind === "full" ? "my-4"
    : layout.kind === "center" ? "my-4 mx-auto w-3/5 md:w-2/5 max-w-xs"
    : layout.kind === "float"
      ? `my-4 mx-auto w-3/5 max-w-xs md:w-[38%] md:mt-1 md:mb-3 ${layout.side === "start" ? "md:float-start md:me-6" : "md:float-end md:ms-6"}`
      : "my-2";
  const wrapperCls =
    hasSrc && layout?.kind === "gallery"
      ? `inline-block align-top w-1/2 px-1.5 md:w-1/3 ${layout.cols === 2 && layout.first ? "md:ms-[16.666%]" : ""}`
      : "";

  switch (s.type) {
    case "h2":
      return wrap(<h2 className="text-2xl md:text-3xl font-bold mt-6 mb-3 gradient-text inline-block"><Editable value={s.text} onChange={(v) => onChange({ text: v } as Partial<Section>)} onEmptyBackspace={onRemove} placeholder="عنوان رئيسي" /></h2>);
    case "h3":
      return wrap(<h3 className="text-xl font-semibold mt-4 mb-2 text-accent-purple"><Editable value={s.text} onChange={(v) => onChange({ text: v } as Partial<Section>)} onEmptyBackspace={onRemove} placeholder="عنوان فرعي" /></h3>);
    case "p":
      return wrap(<Editable as="div" multiline className="block w-full min-h-10 px-2 py-1 -mx-2 text-base md:text-lg leading-loose text-foreground mb-2" value={s.text} onChange={(v) => onChange({ text: v } as Partial<Section>)} onPaste={onParagraphPaste} onEmptyBackspace={onRemove} placeholder="اكتب فقرتك هنا..." />);
    case "emphasis":
      return wrap(<Editable as="div" multiline className="block w-full min-h-10 text-base md:text-lg leading-loose font-bold" value={s.text} onChange={(v) => onChange({ text: v } as Partial<Section>)} onEmptyBackspace={onRemove} placeholder="اكتب النص..." />);
    case "list":
      return wrap(
        <div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <input type="checkbox" checked={!!s.ordered} onChange={(e) => onChange({ ordered: e.target.checked } as Partial<Section>)} />
            مرقّمة
          </label>
          <ul className="space-y-1">
            {s.items.map((it, i) => (
              <li key={i} className="flex gap-2 items-center">
                <span className="text-accent-pink">◆</span>
                <Editable as="span" className="flex-1" value={it} onChange={(v) => {
                  const items = s.items.slice(); items[i] = v; onChange({ items } as Partial<Section>);
                }} onEmptyBackspace={() => {
                  const items = s.items.filter((_, x) => x !== i);
                  if (items.length === 0) onRemove(); else onChange({ items } as Partial<Section>);
                }} placeholder="عنصر" />
                <button className={btnCls} onClick={() => onChange({ items: s.items.filter((_, x) => x !== i) } as Partial<Section>)}>✕</button>
              </li>
            ))}
          </ul>
          <button className={pillCls + " mt-2"} onClick={() => onChange({ items: [...s.items, ""] } as Partial<Section>)}>+ عنصر</button>
        </div>
      );
    case "quote":
      return wrap(
        <blockquote className="my-4 flow-root border-r-4 border-accent-pink bg-muted/60 rounded-l-lg p-4 italic">
          <Editable as="p" multiline className="text-lg" value={s.text} onChange={(v) => onChange({ text: v } as Partial<Section>)} onEmptyBackspace={onRemove} placeholder="اقتباس..." />
          <Editable as="div" className="text-sm text-muted-foreground mt-2" value={s.cite ?? ""} onChange={(v) => onChange({ cite: v } as Partial<Section>)} placeholder="— المصدر" />
        </blockquote>
      );
    case "image":
      return wrap(
        <figure className={figureCls}>
          {s.src ? (
            <button type="button" onClick={() => fileRef.current?.click()} className="block w-full rounded-xl overflow-hidden border border-border hover:ring-2 hover:ring-accent-pink/40 transition">
              <img
                src={s.src}
                alt={s.alt}
                className="w-full"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0) onImageRatio(s.src, img.naturalHeight / img.naturalWidth);
                }}
              />
            </button>
          ) : (
            <button
              type="button"
              data-editor-focus-target="true"
              onClick={() => fileRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Backspace" && !(s.caption ?? "").trim()) {
                  event.preventDefault();
                  onRemove();
                }
              }}
              className="w-full h-32 rounded-xl border-2 border-dashed border-border hover:border-accent-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink flex items-center justify-center text-muted-foreground text-sm transition-colors"
            >
              اضغط لاختيار صورة من جهازك
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => onChange({ src: String(reader.result || "") } as Partial<Section>);
              reader.readAsDataURL(file);
            }}
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" onClick={() => fileRef.current?.click()} className={pillCls}>⬆ رفع صورة</button>
            {s.src && <button type="button" onClick={() => onChange({ src: "" } as Partial<Section>)} className={pillCls}>إزالة الصورة</button>}
          </div>
          <Editable as="div" className="text-sm text-muted-foreground text-center mt-2 [overflow-wrap:anywhere]" value={s.caption ?? ""} onChange={(v) => onChange({ caption: v } as Partial<Section>)} placeholder="تعليق (اختياري)" />
        </figure>,
        wrapperCls,
      );
    case "callout":
      return wrap(
        <aside className="my-4 flow-root rounded-xl p-5 border border-accent-pink/30 gradient-hero">
          <h4 className="font-bold mb-2 text-[oklch(0.4_0.1_330)]">💡 <Editable as="span" value={s.title} onChange={(v) => onChange({ title: v } as Partial<Section>)} placeholder="عنوان الملاحظة" /></h4>
          <Editable as="p" multiline className="leading-relaxed" value={s.text} onChange={(v) => onChange({ text: v } as Partial<Section>)} onEmptyBackspace={onRemove} placeholder="نص الملاحظة..." />
        </aside>
      );
  }
}

function StudioPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [mode, setMode] = useState<"editor" | "chat">("editor");
  const [panel, setPanel] = useState<"code" | "info" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [textImportOpen, setTextImportOpen] = useState(false);
  const [jsonImagesOpen, setJsonImagesOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [undoProject, setUndoProject] = useState<Project | null>(null);
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const pendingFocus = useRef<number | null>(null);
  const mirrored = useRef(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      let p = await getProject(id);
      if (!p) { p = await pullPreview(id); if (p) mirrored.current = true; }
      if (!alive) return;
      if (!p) { navigate({ to: "/" }); return; }
      const valid = /^[A-Za-z0-9]{11}$/.test(p.meta.articleId ?? "");
      const next = valid ? p : { ...p, meta: { ...p.meta, articleId: await newArticleId() } };
      if (alive) setProject(next);
    })();
    return () => { alive = false; };
  }, [id, navigate]);

  const meta = project?.meta;
  const sections = project?.sections ?? [];
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const setImageRatio = useCallback((src: string, ratio: number) => {
    setImageRatios((prev) => (prev[src] === ratio ? prev : { ...prev, [src]: ratio }));
  }, []);
  const imageLayouts = useMemo(() => planImageLayouts(sections, (src) => imageRatios[src]), [sections, imageRatios]);

  const setMeta = (patch: Partial<Meta>) => {
    setProject((p) => p ? { ...p, meta: { ...p.meta, ...patch }, updatedAt: Date.now() } : p);
  };
  const setSections = (updater: (arr: Section[]) => Section[]) => {
    setProject((p) => p ? { ...p, sections: updater(p.sections), updatedAt: Date.now() } : p);
  };

  useEffect(() => {
    if (project) void upsertProject(project);
  }, [project]);

  useEffect(() => {
    if (!project || mirrored.current) return;
    const t = setTimeout(() => void pushPreview(project), 1500);
    return () => clearTimeout(t);
  }, [project]);

  // Drafts are saved to the editor's GitHub copy a few seconds after the last edit (and when leaving the editor).
  const [cloud, setCloud] = useState<"idle" | "saving" | "saved" | "published" | "error">("idle");
  const latest = useRef<Project | null>(null);
  const savedAt = useRef(0);
  const saveToCloud = useCallback(async (p: Project, quiet = false) => {
    if (mirrored.current || p.updatedAt <= savedAt.current) return;
    if (!quiet) setCloud("saving");
    try {
      const r = await autoSaveArticle(p);
      savedAt.current = Math.max(savedAt.current, p.updatedAt);
      if (!quiet) setCloud(r === "published" ? "published" : "saved");
    } catch { if (!quiet) setCloud("error"); }
  }, []);
  useEffect(() => {
    latest.current = project;
    if (!project || mirrored.current) return;
    if (savedAt.current === 0) { savedAt.current = project.updatedAt; return; }
    const t = setTimeout(() => void saveToCloud(project), 12000);
    return () => clearTimeout(t);
  }, [project, saveToCloud]);
  useEffect(() => () => { if (latest.current) void saveToCloud(latest.current, true); }, [saveToCloud]);

  const update = (i: number, patch: Partial<Section>) =>
    setSections((arr) => {
      const current = arr[i];
      const text = (patch as { text?: string }).text;
      if (current?.type === "p" && typeof text === "string") {
        const parsed = parseHeadingText(text);
        if (parsed) return [...arr.slice(0, i), ...parsed, ...arr.slice(i + 1)];
      }
      return arr.map((s, idx) => (idx === i ? ({ ...s, ...patch } as Section) : s));
    });
  const remove = (i: number) => {
    const focusIndex = sections.length > 1 ? Math.min(i, sections.length - 2) : null;
    pendingFocus.current = focusIndex;
    setActiveSection(focusIndex);
    setSections((arr) => arr.filter((_, idx) => idx !== i));
  };
  const move = (i: number, dir: -1 | 1) => setSections((arr) => {
    const j = i + dir; if (j < 0 || j >= arr.length) return arr;
    const current = arr[i];
    const target = arr[j];
    if (!current || !target) return arr;
    const next = arr.slice();
    next[i] = target;
    next[j] = current;
    return next;
  });
  const add = (type: Section["type"]) => setSections((arr) => {
    const insertAt = activeSection === null ? arr.length : activeSection + 1;
    pendingFocus.current = insertAt;
    const next = arr.slice();
    next.splice(insertAt, 0, emptySection(type));
    return next;
  });

  const boldSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const parent = range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement;
    const editable = parent?.closest<HTMLElement>('[contenteditable="true"]');
    if (!editable?.closest('[data-section-index]') || !editable.contains(range.endContainer)) return;
    const strong = document.createElement("strong");
    strong.dataset["boldMarker"] = "**";
    strong.textContent = selection.toString();
    range.deleteContents();
    range.insertNode(strong);
    editable.blur();
    selection.removeAllRanges();
  };

  const pasteParagraph = (index: number, text: string, event: React.ClipboardEvent<HTMLElement>) => {
    const parsed = parseHeadingText(text);
    if (!parsed) return;
    event.preventDefault();
    setSections((arr) => [...arr.slice(0, index), ...parsed, ...arr.slice(index + 1)]);
    setActiveSection(index + Math.max(parsed.length - 1, 0));
  };

  useEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    pendingFocus.current = null;
    requestAnimationFrame(() => {
      const focusTarget = document.querySelector<HTMLElement>(`[data-section-index="${index}"] [data-editor-focus-target="true"], [data-section-index="${index}"] [contenteditable="true"], [data-section-index="${index}"] input:not([type="hidden"])`);
      focusTarget?.focus();
    });
  }, [sections.length]);

  const tsCode = useMemo(() => meta ? buildArticleTs(meta, sections) : "", [meta, sections]);

  const download = () => {
    if (!meta) return;
    const blob = new Blob([tsCode], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = articleFileName(meta.title, meta.articleId || "untitled");
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const copy = async () => { try { await navigator.clipboard.writeText(tsCode); } catch {} };

  const saveMeta = (v: ProjectMetaValues) => {
    const slug = (v.title || "untitled").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
    setProject((p) => p ? {
      ...p,
      title: v.title,
      excerpt: v.excerpt,
      thumbnail: v.thumbnail,
      categories: v.categories,
      tags: v.tags,
      updatedAt: Date.now(),
      meta: {
        ...p.meta,
        title: v.title,
        slug,
        excerpt: v.excerpt,
        categories: v.categories,
        tags: v.tags,
        hero: v.thumbnail,
      },
    } : p);
    setMetaOpen(false);
  };

  if (!project || !meta) {
    return <WikiLayout><p className="text-muted-foreground">تحميل...</p></WikiLayout>;
  }

  const iconBtn = "shrink-0 grid h-8 w-8 place-items-center rounded-full bg-[oklch(0.95_0.04_350)] text-accent-pink hover:bg-accent-pink hover:text-white transition-colors";
  const tools: { t: Section["type"]; icon: React.ReactNode; label: string }[] = [
    { t: "h2", icon: <Heading2 size={16} />, label: "Heading 2" },
    { t: "h3", icon: <Heading3 size={16} />, label: "Heading 3" },
    { t: "p", icon: <Pilcrow size={16} />, label: "Paragraph" },
    { t: "list", icon: <List size={16} />, label: "List" },
    { t: "quote", icon: <Quote size={16} />, label: "Quote" },
    { t: "image", icon: <ImageIcon size={16} />, label: "Image" },
    { t: "callout", icon: <Lightbulb size={16} />, label: "Callout" },
  ];

  const aiContext = `Title: ${meta.title}\nCategory: ${(meta.categories ?? [])[0] ?? ""}\nTags: ${(meta.tags ?? []).join(", ")}\n\n${sections.map((s) => `[${s.type}] ${"text" in s ? s.text : s.type === "list" ? s.items.join(" | ") : s.caption ?? ""}`).join("\n")}`;

  const articleDir = detectArticleDir([meta.title ?? "", ...sections.map((s) => ("text" in s ? s.text : s.type === "list" ? s.items.join(" ") : ""))]);

  return (
    <WikiLayout>
      <div dir="ltr" className="sticky top-2 z-20 mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-full bg-card border border-border shadow-[var(--card-shadow)] px-2 py-1.5">
        <div className="flex items-center gap-1 min-w-0">
          <Link to="/" title="All projects" className="shrink-0 grid h-8 w-8 place-items-center rounded-full hover:bg-muted text-foreground">
            <ArrowLeft size={18} />
          </Link>
          <span dir="auto" className="truncate text-xs text-muted-foreground hidden sm:block">{meta.title}</span>
          {cloud !== "idle" && (
            <span role="status" title={{ saving: "جارٍ الحفظ على GitHub…", saved: "محفوظ على GitHub", published: "مقال منشور: حدّثه على الموقع من لوحة التحكم", error: "تعذر الحفظ على GitHub", idle: "" }[cloud]} className={`shrink-0 ${cloud === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {cloud === "saving" ? <Loader2 size={14} className="animate-spin" /> : cloud === "error" ? <CloudOff size={14} /> : <Cloud size={14} />}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5 rounded-full bg-muted p-0.5">
            <button onClick={() => setMode("editor")} className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-all ${mode === "editor" ? "bg-card text-accent-pink shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><PenLine size={14} /> المحرر</button>
            <button onClick={() => setMode("chat")} className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-all ${mode === "chat" ? "bg-card text-accent-pink shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Bot size={14} /> AI</button>
          </div>
          <button onClick={download} title="Download TS" className="shrink-0 h-8 px-3 rounded-full bg-accent-pink text-primary-foreground text-xs font-medium hover:opacity-90 flex items-center gap-1 shadow-sm"><Download size={14} /> TS</button>
        </div>
        <div className="flex items-center justify-end gap-1">
          {undoProject && <button onClick={async () => { if (await upsertProject(undoProject)) { setProject(undoProject); setUndoProject(null); } }} title="تراجع عن الأوامر" className={iconBtn}><Undo2 size={16} /></button>}
          <button onClick={() => setCommandsOpen(true)} title="أوامر" className="h-8 px-3 rounded-full bg-muted text-xs font-medium hover:bg-border flex items-center gap-1"><Terminal size={14} /> أوامر</button>
          <Link to="/studio/$id/images" params={{ id }} title="Image placeholders [🖼:name]" className={iconBtn}><Images size={16} /></Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button title="More" className={iconBtn}><MoreHorizontal size={16} /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-lg">
              <DropdownMenuItem onClick={copy}><Copy size={14} /> نسخ كود TS</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPanel("code")}><Code2 size={14} /> عرض الكود</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportOpen(true)}><ClipboardPaste size={14} /> وضع كود TS</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTextImportOpen(true)}><ClipboardPaste size={14} /> تحويل نص منسق</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setJsonImagesOpen(true)}><ImagePlus size={14} /> إدراج صور من JSON</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPanel("info")}><Info size={14} /> معلومات المقال</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {mode === "editor" && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-3 pointer-events-none">
          <div dir="ltr" className="pointer-events-auto max-w-full flex items-center gap-1.5 overflow-x-auto rounded-full bg-card border border-border shadow-lg px-2 py-1.5">
            <Button variant="ghost" size="icon" onMouseDown={(e) => e.preventDefault()} onClick={boldSelection} title="نقطة مهمة" aria-label="نقطة مهمة" className="h-8 w-8 shrink-0 rounded-full text-accent-pink hover:bg-muted"><Bold size={16} /></Button>
            {tools.map(({ t, icon, label }) => (
              <button key={t} onMouseDown={(e) => e.preventDefault()} onClick={() => add(t)} title={label} className={iconBtn}>{icon}</button>
            ))}
          </div>
        </div>
      )}

      {mode === "chat" ? (
        <AiChatPanel articleId={meta.articleId ?? id} context={aiContext} onApply={(a) => {
          setMeta({ title: a.title || meta.title, excerpt: a.description || meta.excerpt, categories: a.category ? [a.category] : meta.categories, tags: a.tags.length ? a.tags : meta.tags });
          setSections(() => a.sections as Section[]);
        }} />
      ) : (<div className="pb-28">
      <article dir={articleDir} className="bg-card border border-border rounded-2xl p-6 md:p-10 shadow-[var(--card-shadow)]">
        {/* Metadata block — click any part to edit via the modal */}
        <button
          type="button"
          onClick={() => setMetaOpen(true)}
          className="w-full text-start rounded-lg p-3 -mx-3 hover:bg-muted/50 transition-colors mb-4"
          title="تعديل الماتاداتا"
        >
          <h1 dir="auto" className="text-3xl md:text-4xl font-bold mb-3 gradient-text inline-block">
            {meta.title || <span className="text-muted-foreground/60">عنوان المقال</span>}
          </h1>
          <div className="flex flex-wrap gap-2 items-center text-xs">
            {(meta.categories ?? []).map((c) => (
              <span key={c} className="px-2 py-0.5 rounded-full bg-[oklch(0.97_0.03_350)] text-accent-pink">{c}</span>
            ))}
            {(meta.tags ?? []).length > 0 && <span className="opacity-60">tags:</span>}
            {(meta.tags ?? []).map((t) => (
              <span key={t} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">#{t}</span>
            ))}
            {(meta.categories ?? []).length === 0 && (meta.tags ?? []).length === 0 && (
              <span className="text-muted-foreground/60">اضغط لإضافة تصنيفات ووسوم</span>
            )}
          </div>
        </button>

        <div className="mb-6">
          {meta.hero ? (
            <button
              type="button"
              onClick={() => setMetaOpen(true)}
              className="block w-full rounded-xl overflow-hidden border border-border hover:ring-2 hover:ring-accent-pink/40 transition"
              title="تعديل الماتاداتا"
            >
              <img src={meta.hero} alt={meta.title} className="w-full h-56 md:h-80 object-cover" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMetaOpen(true)}
              className="w-full h-40 md:h-56 rounded-xl border-2 border-dashed border-border hover:border-accent-pink flex items-center justify-center text-muted-foreground text-sm transition-colors"
            >
              اضغط لإضافة صورة رئيسية
            </button>
          )}
        </div>

        <div className="mt-6">
          {sections.map((s, i) => (
            <Fragment key={i}>
            {needsClearBefore(sections, imageLayouts, i) && <div className="clear-both" />}
            <InlineSection s={s} index={i}
              layout={imageLayouts[i] ?? null}
              onImageRatio={setImageRatio}
              onChange={(patch) => update(i, patch)}
              onRemove={() => remove(i)}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
              onActivate={() => setActiveSection(i)}
              onParagraphPaste={(text, event) => pasteParagraph(i, text, event)}
            />
            </Fragment>
          ))}
          <div className="clear-both" />
          {sections.length === 0 && <p className="text-muted-foreground text-sm">استخدم الشريط بالأسفل لإضافة أول قسم.</p>}
        </div>
      </article>

      </div>)}

      <TextImportDialog open={textImportOpen} onClose={() => setTextImportOpen(false)} onImport={(sections) => {
        setProject((current) => current ? { ...current, sections, updatedAt: Date.now() } : current);
        setActiveSection(null); pendingFocus.current = null; setMode("editor");
      }} />
      {project && <CommandsDialog open={commandsOpen} onClose={() => setCommandsOpen(false)} article={{ meta: project.meta, sections: project.sections }} onApply={async (next) => {
        const updated = { ...project, meta: next.meta, sections: next.sections, updatedAt: Date.now() };
        if (!(await upsertProject(updated))) throw new Error("لم يُحفظ المقال في مساحة المتصفح.");
        setUndoProject(project); setProject(updated);
        setActiveSection(null); pendingFocus.current = null; setMode("editor");
      }} />}
      <JsonImagesDialog open={jsonImagesOpen} onClose={() => setJsonImagesOpen(false)} sections={sections} onApply={async (next) => {
        if (!project) throw new Error("المقال غير محمّل بعد.");
        const updated = { ...project, sections: next, updatedAt: Date.now() };
        if (!(await upsertProject(updated))) throw new Error("لم يُحفظ المقال في مساحة المتصفح.");
        setProject(updated);
        setActiveSection(null); pendingFocus.current = null; setMode("editor");
      }} />
      <ArticleImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={(article) => {
        setProject((current) => {
          if (!current) return current;
          const slug = article.title.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
          return {
            ...current, title: article.title, excerpt: article.excerpt, thumbnail: article.hero,
            categories: article.categories, tags: article.tags, sections: article.sections, updatedAt: Date.now(),
            meta: { ...current.meta, title: article.title, slug, excerpt: article.excerpt, hero: article.hero,
              categories: article.categories, tags: article.tags, ...(article.articleId ? { articleId: article.articleId } : {}) },
          };
        });
        setActiveSection(null); pendingFocus.current = null; setMode("editor");
      }} />

      <Dialog open={panel === "code"} onOpenChange={(o) => !o && setPanel(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>كود TS المُصدَّر</DialogTitle></DialogHeader>
          <pre dir="ltr" className="text-xs bg-muted/50 border border-border rounded-xl p-4 overflow-auto max-h-[65vh]"><code>{tsCode}</code></pre>
          <button onClick={copy} className="self-end flex items-center gap-1.5 h-9 px-4 rounded-full bg-accent-pink text-primary-foreground text-sm"><Copy size={14} /> نسخ</button>
        </DialogContent>
      </Dialog>

      <Dialog open={panel === "info"} onOpenChange={(o) => !o && setPanel(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>معلومات المقال</DialogTitle></DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">المعرّف</dt>
            <dd dir="ltr" className="font-mono text-right">{meta.articleId}</dd>
            <dt className="text-muted-foreground">اسم الملف</dt>
            <dd dir="ltr" className="font-mono text-right">{articleFileName(meta.title, meta.articleId || "untitled")}</dd>
            <dt className="text-muted-foreground">التصنيف</dt>
            <dd>{(meta.categories ?? [])[0] || "—"}</dd>
            <dt className="text-muted-foreground">الوسوم</dt>
            <dd className="flex flex-wrap gap-1">{(meta.tags ?? []).length ? meta.tags!.map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-muted text-xs">#{t}</span>) : "—"}</dd>
            <dt className="text-muted-foreground">الأقسام</dt>
            <dd>{sections.length}</dd>
          </dl>
          <button onClick={() => { setPanel(null); setMetaOpen(true); }} className="self-start h-9 px-4 rounded-full bg-muted hover:bg-border text-sm">تعديل الماتاداتا</button>
        </DialogContent>
      </Dialog>


      {metaOpen && (
        <ProjectMetaModal
          title="تعديل الماتاداتا"
          submitLabel="حفظ"
          initial={{
            title: meta.title,
            excerpt: meta.excerpt,
            thumbnail: meta.hero,
            categories: meta.categories ?? [],
            tags: meta.tags ?? [],
          }}
          onClose={() => setMetaOpen(false)}
          onSubmit={saveMeta}
        />
      )}
    </WikiLayout>
  );
}
