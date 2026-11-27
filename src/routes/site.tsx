import { createFileRoute, Outlet } from "@tanstack/react-router";
import siteCss from "@/site/site.css?url";

// The main Veguto site, merged into the studio and shown inside the Dashboard frame.
export const Route = createFileRoute("/site")({
  head: () => ({
    meta: [
      { title: "Veguto Wiki — Tiny guides for the internet we love" },
      { name: "description", content: "Veguto Wiki collects little guides on anime, manga, cozy gaming, aesthetics, cosplay, VTubers and more." },
      { property: "og:title", content: "Veguto Wiki" },
      { property: "og:description", content: "Little wiki articles on anime, manga, cozy gaming, kawaii, cosplay and VTubers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: siteCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&family=Quicksand:wght@300;400;500;600;700&display=swap" },
    ],
  }),
  component: () => (
    <div dir="ltr" lang="en">
      <Outlet />
    </div>
  ),
});
