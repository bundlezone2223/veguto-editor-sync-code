import { z } from "zod";
import type { Section } from "@/lib/article-content";

const imageSource = z.string().refine((value) => !value || /^(https?:\/\/|data:image\/|blob:|\/|\.\/|\.\.\/)/i.test(value), "رابط الصورة غير صالح");
const sectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("h2"), text: z.string() }),
  z.object({ type: z.literal("h3"), text: z.string() }),
  z.object({ type: z.literal("p"), text: z.string() }),
  z.object({ type: z.literal("emphasis"), text: z.string() }),
  z.object({ type: z.literal("quote"), text: z.string(), cite: z.string().optional() }),
  z.object({ type: z.literal("list"), items: z.array(z.string()), ordered: z.boolean().optional() }),
  z.object({ type: z.literal("image"), src: imageSource, alt: z.string(), caption: z.string().optional() }),
  z.object({ type: z.literal("callout"), title: z.string(), text: z.string() }),
]);
const articleSchema = z.object({
  id: z.string().optional(), articleId: z.string().optional(),
  title: z.string().min(1), description: z.string().optional(), excerpt: z.string().optional(),
  thumbnail: imageSource.optional(), hero: imageSource.optional(),
  category: z.string().optional(), categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  content: z.array(sectionSchema).optional(), sections: z.array(sectionSchema).optional(),
}).refine((article) => article.content !== undefined || article.sections !== undefined, "المقال يحتاج content أو sections");

/** Read static TS literals only; never execute pasted code or interpolate templates. */
export async function parseArticleTs(source: string): Promise<{
  title: string; excerpt: string; hero: string; categories: string[]; tags: string[];
  articleId?: string; sections: Section[];
}> {
  if (source.length > 2_000_000) throw new Error("الكود كبير جدًا؛ الحد الأقصى مليونا حرف.");
  const ts = await import("typescript");
  const code = source.trim().replace(/^```(?:typescript|ts|json)?\s*\n/i, "").replace(/\n```\s*$/, "");
  let value: unknown;
  try { value = JSON.parse(code); } catch {
    const file = ts.createSourceFile("article.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    // Syntax diagnostics are exposed on SourceFile at runtime.
    const diagnostics = (file as typeof file & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics;
    if (diagnostics?.length) throw new Error("كود TS غير مكتمل أو يحتوي على خطأ في الكتابة.");
    const read = (node: import("typescript").Expression): unknown => {
      if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return read(node.expression);
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
      if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (ts.isArrayLiteralExpression(node)) return node.elements.map((item) => read(item));
      if (ts.isObjectLiteralExpression(node)) {
        const object: Record<string, unknown> = Object.create(null);
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property)) throw new Error("استخدم قيمًا مباشرة دون دوال أو نشر متغيرات.");
          const name = property.name;
          if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) throw new Error("اسم حقل غير مدعوم.");
          if (["__proto__", "constructor", "prototype"].includes(name.text)) throw new Error("اسم حقل غير مسموح.");
          object[name.text] = read(property.initializer);
        }
        return object;
      }
      throw new Error("يسمح فقط بالنصوص والقوائم والقيم المباشرة؛ لا يتم تشغيل أي كود.");
    };
    let expression: import("typescript").Expression | undefined;
    for (const statement of file.statements) {
      if (ts.isImportDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isEmptyStatement(statement)) continue;
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "article" || !declaration.initializer) throw new Error("ضع بيانات المقال داخل const article مباشرة.");
          expression = declaration.initializer;
        }
      } else if (ts.isExportAssignment(statement)) {
        if (ts.isIdentifier(statement.expression) && statement.expression.text === "article") continue;
        expression = statement.expression;
      } else if (ts.isExpressionStatement(statement) && ts.isParenthesizedExpression(statement.expression)) {
        expression = statement.expression;
      } else throw new Error("صيغة غير مدعومة؛ الصق كود المقال المُصدَّر فقط.");
    }
    if (!expression) throw new Error("لم أجد بيانات المقال في الكود.");
    value = read(expression);
  }
  const result = articleSchema.safeParse(value);
  if (!result.success) throw new Error("بيانات المقال غير صحيحة: تحقق من العنوان ونوع الأقسام وحقولها.");
  const article = result.data;
  const id = article.id ?? article.articleId;
  return {
    title: article.title, excerpt: article.description ?? article.excerpt ?? "",
    hero: article.thumbnail ?? article.hero ?? "", categories: article.categories ?? (article.category ? [article.category] : []),
    tags: article.tags ?? [], ...(id && /^[A-Za-z0-9]{11}$/.test(id) ? { articleId: id } : {}),
    sections: (article.content ?? article.sections ?? []).map((section): Section => {
      switch (section.type) {
        case "quote": return { type: "quote", text: section.text, ...(section.cite !== undefined ? { cite: section.cite } : {}) };
        case "list": return { type: "list", items: section.items, ...(section.ordered !== undefined ? { ordered: section.ordered } : {}) };
        case "image": return { type: "image", src: section.src, alt: section.alt, ...(section.caption !== undefined ? { caption: section.caption } : {}) };
        default: return section;
      }
    }),
  };
}