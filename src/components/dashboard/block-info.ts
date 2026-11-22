import { BarChart3, MessageCircle, Newspaper, PanelLeft, Sparkles, Tags, type LucideIcon } from "lucide-react";
import type { BlockType } from "@/lib/site-config";

export type EditTarget = BlockType | "sidebar";

export const BLOCK_INFO: Record<EditTarget, { label: string; Icon: LucideIcon }> = {
  hero: { label: "بنر الترحيب", Icon: Sparkles },
  stats: { label: "بطاقات الأرقام", Icon: BarChart3 },
  feed: { label: "المقالات والأقسام", Icon: Newspaper },
  discord: { label: "بنر ديسكورد", Icon: MessageCircle },
  tags: { label: "الوسوم الشائعة", Icon: Tags },
  sidebar: { label: "القائمة الجانبية", Icon: PanelLeft },
};
