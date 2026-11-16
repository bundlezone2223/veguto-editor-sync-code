import { createServerFn } from "@tanstack/react-start";
import { callGemini, parseJson, tavilySearch, type Source } from "./agent.server";

type ChatMsg = { role: "user" | "assistant"; content: string };

export type AgentSection =
  | { type: "h2" | "h3" | "p"; text: string }
  | { type: "emphasis"; text: string }
  | { type: "quote"; text: string; cite?: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "callout"; title: string; text: string };

export type AgentArticle = {
  title: string;
  category: string;
  tags: string[];
  description: string;
  sections: AgentSection[];
};

const BASE = `You are "Veguto Agent", a senior wiki-article agent inside Veguto Wiki Studio.
The writer talks to you in Arabic. Published articles are in English (the writer may request an Arabic draft first).
Article sections allowed: h2, h3, p, emphasis, quote, list, callout. Use emphasis for an occasional key point that deserves strong visual focus, not for ordinary prose. Never add images, image placeholders, image suggestions or markers like [🖼:...] anywhere.
Style: encyclopedic yet engaging, precise, no filler, no AI clichés ("In today's world", "delve", "tapestry").`;

const fmtHistory = (m: ChatMsg[]) => m.slice(-12).map((x) => `${x.role === "user" ? "Writer" : "Agent"}: ${x.content}`).join("\n");

/** Stage 1: router + analysis */
export const agentPlan = createServerFn({ method: "POST" })
  .inputValidator((d: { messages: ChatMsg[]; context: string }) => d)
  .handler(async ({ data }) => {
    try {
      const raw = await callGemini({
        json: true,
        system: `${BASE}
You are the ROUTER and ANALYST. Decide the intent of the writer's latest message:
- "chat": question, advice, brainstorming, short translation, anything not requiring rewriting the article.
- "write": create a full new article on a topic.
- "edit": modify/extend/translate the existing article in the editor.
Return JSON: {"intent":"chat|write|edit","reply":"(Arabic answer, only for chat, markdown allowed)","topic":"English topic","language":"en|ar","angles":["key angles to cover"],"queries":["3-5 precise English web search queries (empty for chat or if no facts needed)"],"plan":"Arabic 1-3 sentence plan shown to the writer"}`,
        prompt: `Current article in editor:\n${data.context.slice(0, 12000)}\n\nConversation:\n${fmtHistory(data.messages)}`,
      });
      const p = parseJson<{ intent: "chat" | "write" | "edit"; reply?: string; topic?: string; language?: "en" | "ar"; angles?: string[]; queries?: string[]; plan?: string }>(raw);
      return { error: null as string | null, plan: { intent: p.intent ?? "chat", reply: p.reply ?? "", topic: p.topic ?? "", language: p.language ?? "en", angles: p.angles ?? [], queries: (p.queries ?? []).slice(0, 5), plan: p.plan ?? "" } };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "فشل التحليل", plan: null };
    }
  });

/** Stage 2: Tavily research */
export const agentResearch = createServerFn({ method: "POST" })
  .inputValidator((d: { queries: string[] }) => d)
  .handler(async ({ data }) => {
    try {
      const all = await Promise.all(data.queries.slice(0, 5).map((q) => tavilySearch(q)));
      const seen = new Set<string>();
      const sources: Source[] = [];
      for (const r of all) for (const s of r.results) if (!seen.has(s.url)) { seen.add(s.url); sources.push(s); }
      return { error: null as string | null, sources: sources.slice(0, 14), answers: all.map((a) => a.answer).filter(Boolean) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "فشل البحث", sources: [] as Source[], answers: [] as string[] };
    }
  });

const researchBlock = (sources: Source[], answers: string[]) =>
  `${answers.map((a, i) => `Summary ${i + 1}: ${a}`).join("\n")}\n\n${sources.map((s, i) => `[S${i + 1}] ${s.title} — ${s.url}\n${s.content}`).join("\n\n")}`;

/** Stage 3: outline + draft + polish */
export const agentWrite = createServerFn({ method: "POST" })
  .inputValidator((d: { intent: "write" | "edit"; instruction: string; topic: string; language: string; angles: string[]; context: string; sources: Source[]; answers: string[]; feedback?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const raw = await callGemini({
        json: true,
        system: `${BASE}
You are the ARCHITECT and WRITER. Think deeply: first design a strong outline (logical flow, h2 for main sections, h3 for sub-points, a callout for a key insight, lists where scannable), then write.
Rules:
- Use ONLY facts supported by the research; never invent numbers, dates or quotes. If unsure, omit.
- Start with an intro paragraph (no heading). 5-9 h2 sections for a full article.
- Do NOT add any image placeholders or image suggestions (no [🖼:...] markers, no "image here" notes).
- Use the "emphasis" section sparingly for a genuinely important takeaway.
- Language of article text: ${data.language === "ar" ? "Arabic" : "English"}.
- For "edit": keep the existing article and apply the instruction; return the FULL updated article.
- description: 100-150 characters card summary. category: one lowercase slug. tags: 4-7 lowercase-kebab tags.
Return JSON: {"title":"","category":"","tags":[],"description":"","sections":[{"type":"p","text":""},{"type":"h2","text":""},{"type":"emphasis","text":"Key point"},{"type":"list","items":[""],"ordered":false},{"type":"callout","title":"","text":""},{"type":"quote","text":"","cite":""}]}`,
        prompt: `Mode: ${data.intent}\nWriter instruction: ${data.instruction}\nTopic: ${data.topic}\nAngles: ${data.angles.join("; ")}\n${data.feedback ? `\nReviewer feedback to fix:\n${data.feedback}\n` : ""}\nExisting article:\n${data.context.slice(0, 15000)}\n\nResearch:\n${researchBlock(data.sources, data.answers).slice(0, 30000)}`,
      });
      const a = parseJson<AgentArticle>(raw);
      const sections = (a.sections ?? [])
        .filter((s) => s && typeof s.type === "string")
        .map((s) => ("text" in s && typeof s.text === "string" ? { ...s, text: s.text.replace(/\[🖼:[^\]]*\]/gu, "").trim() } : s))
        .filter((s) => !(s.type === "p" && "text" in s && !s.text));
      return { error: null as string | null, article: { title: a.title ?? "", category: a.category ?? "", tags: a.tags ?? [], description: a.description ?? "", sections } as AgentArticle };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "فشلت الكتابة", article: null };
    }
  });

/** Stage 4: independent reviewer (sees only output + research) */
export const agentReview = createServerFn({ method: "POST" })
  .inputValidator((d: { article: AgentArticle; sources: Source[]; answers: string[] }) => d)
  .handler(async ({ data }) => {
    try {
      const text = data.article.sections.map((s) => ("text" in s ? `[${s.type}] ${s.text}` : s.type === "list" ? `[list] ${s.items.join(" | ")}` : "")).join("\n");
      const raw = await callGemini({
        json: true,
        system: `You are an INDEPENDENT fact-checker and editor. You did not write this article. Be strict.
Check every factual claim against the research. Score on a 100-point rubric: accuracy 35, structure 20, clarity & style 20, coverage 15, SEO/metadata 10.
Return JSON: {"score":0,"verdict":"ready|needs_fix","unsupported":["claims not supported by research"],"issues":["concrete fixes"],"summary":"Arabic 1-2 sentence verdict"}`,
        prompt: `Title: ${data.article.title}\nDescription: ${data.article.description}\nTags: ${data.article.tags.join(", ")}\n\nArticle:\n${text}\n\nResearch:\n${researchBlock(data.sources, data.answers).slice(0, 25000)}`,
      });
      const r = parseJson<{ score: number; verdict: string; unsupported?: string[]; issues?: string[]; summary?: string }>(raw);
      return { error: null as string | null, review: { score: Number(r.score) || 0, verdict: r.verdict === "ready" ? "ready" : "needs_fix", unsupported: r.unsupported ?? [], issues: r.issues ?? [], summary: r.summary ?? "" } };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "فشل التدقيق", review: null };
    }
  });
