export type Category = {
  slug: string;
  icon: string;
  title: string;
  desc: string;
};

export const categories: Category[] = [
  { slug: "community", icon: "🔰", title: "دليل البدء للمجتمع", desc: "قوانين السيرفر، الرتب، وكيفية الانضمام إلينا." },
  { slug: "vtubers", icon: "✨", title: "شخصيات VTubers", desc: "ملفات وقصص شخصيات الـ VTubers في المجتمع." },
  { slug: "games", icon: "🎮", title: "الألعاب والفعاليات", desc: "شروحات سيرفر Minecraft والفعاليات الأسبوعية." },
  { slug: "tech", icon: "🎨", title: "البرمجة والتصميم", desc: "دروس ومصادر رقمية يشاركها أعضاء المجتمع." },
];

export type Article = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  time: string;
  emoji: string;
  body: string;
};

export const articles: Article[] = [

  {
    slug: "vtubing-guide",
    title: "دليل البدء في صناعة محتوى الـ VTubing",
    excerpt: "شرح مبسط للأدوات والبرامج المجانية التي تحتاجها لتجهيز موديل شخصيتك والبث بها لأول مرة.",
    category: "vtubers",
    time: "منذ 5 أيام",
    emoji: "🎬",
    body: "في هذا الدليل سنغطي خطوات إنشاء شخصية VTuber كاملة: اختيار الموديل (Live2D أو 3D)، إعداد برنامج التتبع مثل VTube Studio، ربطه ببرنامج البث OBS، وأخيراً نصائح للبث الأول. كل الأدوات المذكورة مجانية تماماً ومناسبة للمبتدئين."
  },
  {
    slug: "games-rules-update",
    title: "تحديث قوانين قسم الألعاب",
    excerpt: "تعديلات جديدة على قوانين السيرفر تضمن تجربة لعب أفضل للجميع.",
    category: "games",
    time: "منذ ساعتين",
    emoji: "📜",
    body: "تم تحديث قوانين قسم الألعاب لتشمل: منع استخدام أي برامج غش، احترام جميع اللاعبين، وعدم تخريب البناء الخاص بالآخرين في Minecraft."
  },
  {
    slug: "minecraft-connect",
    title: "شرح الاتصال بسيرفر الجافا والبدروك",
    excerpt: "خطوات تفصيلية للاتصال بسيرفر Anidigital من نسخة Java أو Bedrock.",
    category: "games",
    time: "منذ يومين",
    emoji: "🎮",
    body: "للاتصال بسيرفر Java استخدم العنوان play.anidigital.com على المنفذ 25565. للاتصال من Bedrock استخدم نفس العنوان مع المنفذ 19132."
  },
  {
    slug: "acode-customize",
    title: "كيفية تخصيص واجهة Acode للبرمجة",
    excerpt: "خطوات لتغيير الثيم والخطوط في محرر Acode على الأندرويد.",
    category: "tech",
    time: "منذ 3 أيام",
    emoji: "💻",
    body: "افتح Acode، توجه إلى الإعدادات > Appearance > Theme لاختيار ثيم مظلم أو فاتح. لتغيير الخط استخدم Editor Settings > Font."
  },
  {
    slug: "discord-roles",
    title: "شرح رتب الديسكورد",
    excerpt: "تعرّف على جميع رتب سيرفر الديسكورد وكيفية الحصول عليها.",
    category: "community",
    time: "منذ أسبوع",
    emoji: "🏅",
    body: "نظام الرتب يعتمد على مستوى النشاط والمساهمة. ابدأ كعضو جديد ثم تترقى تلقائياً عبر التفاعل والمشاركة في الفعاليات."
  },
];

export const recentArticles = articles.slice(0, 3).map((a) => ({
  slug: a.slug, title: a.title, time: a.time,
}));

export const featuredArticles: Article[] = [articles[0]!, articles[4]!];

