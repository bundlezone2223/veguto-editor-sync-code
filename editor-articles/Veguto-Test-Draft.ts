import type { Section } from "./types";

export const article = {
  id: `TestDraft01`,
  title: `Veguto Test Draft`,
  description: `test`,
  thumbnail: "",
  category: `gaming`,
  tags: [`test`],
  content: [
    { type: "p", text: `Hello **world**.` }
  ] as Section[],
};

export default article;
