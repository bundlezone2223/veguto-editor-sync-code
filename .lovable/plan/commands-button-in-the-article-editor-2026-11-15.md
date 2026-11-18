# Commands button in the article editor

## Goal
A new "أوامر" (Commands) button in the editor toolbar. It opens a window where you paste a command text I give you in chat. Pressing "تنفيذ" applies all the changes to the open article instantly, with a preview of what will change and an undo.

## Workflow
1. You send me the topic, text, or images in chat.
2. I open the preview, review the article, and give you one command block.
3. You paste it in the Commands window, review the summary, and press Execute.
4. The article updates and saves; one Undo button restores the previous version.

## What the commands can do
- **Article:** set title, category, description, tags, or replace the whole article.
- **Sections:** add (start, end, before/after a heading or a sentence), replace, delete, move. All existing section kinds: headings, paragraphs, quotes, lists, callouts, images.
- **Text fixes:** find and replace words or phrases across the article (spelling/grammar fixes).
- **Important words:** make chosen words bold everywhere they appear.
- **Images:** add from a link (downloaded and stored inside the article so it never breaks), with alt text and caption, at an anchor sentence or heading; change caption; swap or remove an image.
- Images still follow the existing smart layout (side, gallery, or centered) automatically.

## Safety
- The pasted text is data only; it is never run as code.
- Everything is validated first; if any command is invalid, nothing changes and the window shows which line failed and why.
- A summary list ("12 changes: 3 added, 1 deleted...") appears before applying.

## Technical details
- Format: JSON `{ "version": 1, "ops": [ { "op": "...", ... } ] }`.
- Ops: `set_meta`, `replace_article`, `insert`, `replace`, `delete`, `move`, `find_replace`, `bold_terms`, `add_image`, `update_image`, `remove_image`.
- Targets: `{ heading }`, `{ anchor_text }`, `{ index }`, `"start"`/`"end"`, with `position: before|after`.
- New pure module `src/lib/article-commands.ts` (parse + validate against the canonical Section type, apply to a copy). Reuses inline-bold formatter, json-images anchor logic, and the server-side Base64 image fetcher.
- New `src/components/CommandsDialog.tsx`; toolbar button added in `src/routes/studio.$id.tsx`; save via existing IndexedDB store.
- Vitest tests for each op and for rejecting invalid input without changes.
- Add a rule to AGENTS.md keeping command ops in sync with section variants.
