/** Line-by-line diff (LCS). Very large files fall back to "all removed, all added". */
export type DiffLine = { type: " " | "+" | "-"; text: string };

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n"), b = after.split("\n");
  if (a.length * b.length > 4_000_000) return [...a.map((t) => ({ type: "-" as const, text: t })), ...b.map((t) => ({ type: "+" as const, text: t }))];
  const n = a.length, m = b.length, w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: " ", text: a[i]! }); i++; j++; }
    else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) out.push({ type: "-", text: a[i++]! });
    else out.push({ type: "+", text: b[j++]! });
  }
  while (i < n) out.push({ type: "-", text: a[i++]! });
  while (j < m) out.push({ type: "+", text: b[j++]! });
  return out;
}
