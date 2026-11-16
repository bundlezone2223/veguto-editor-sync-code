// Server-only helpers for the Veguto agent: Gemini (writer's own key only) + Tavily search.

export async function callGemini(opts: { system: string; prompt: string; json?: boolean; model?: string }): Promise<string> {
  const model = opts.model ?? "gemini-2.5-flash";
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("مفتاح Gemini غير مُعدّ.");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: { temperature: 0.6, ...(opts.json ? { responseMimeType: "application/json" } : {}) },
    }),
  });
  if (!res.ok) {
    console.error("Gemini", res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new Error(res.status === 429 ? "تجاوزت حد طلبات Gemini، حاول بعد قليل." : `خطأ من Gemini (${res.status})`);
  }
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("لم يُرجع Gemini أي نص.");
  return text;
}

export function parseJson<T>(raw: string): T {
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(s) as T; } catch {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    return JSON.parse(s.slice(a, b + 1)) as T;
  }
}

export type Source = { title: string; url: string; content: string };

export async function tavilySearch(query: string): Promise<{ answer: string; results: Source[] }> {
  const key = process.env["TAVILY_API_KEY"];
  if (!key) throw new Error("مفتاح Tavily غير مُعدّ.");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, search_depth: "advanced", max_results: 5, include_answer: true }),
  });
  if (!res.ok) {
    console.error("Tavily", res.status, await res.text().catch(() => ""));
    return { answer: "", results: [] };
  }
  const j = (await res.json()) as { answer?: string; results?: { title: string; url: string; content: string }[] };
  return {
    answer: j.answer ?? "",
    results: (j.results ?? []).map((r) => ({ title: r.title, url: r.url, content: (r.content ?? "").slice(0, 1200) })),
  };
}
