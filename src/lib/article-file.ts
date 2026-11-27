import { parseArticleTs } from "./article-import";

export type ImportedArticle = Awaited<ReturnType<typeof parseArticleTs>>;

export async function readArticleFile(file: Pick<File, "name" | "text">): Promise<ImportedArticle> {
  if (!/\.ts$/i.test(file.name)) throw new Error("اختر ملف المقال بصيغة TS، وليس ZIP.");
  return parseArticleTs(await file.text(), { maxLength: 200_000_000 });
}