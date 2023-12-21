import type { SiteConfig } from "@/types";

export const siteConfig: SiteConfig = {
	// Used as both a meta property (src/components/BaseHead.astro L:31 + L:49) & the generated satori png (src/pages/og-image/[slug].png.ts)
	author: "Andrei Calazans",
	// Meta property used to construct the meta title property, found in src/components/BaseHead.astro L:11
	title: "Andrei Calazans",
	// Meta property used as the default description meta property
	description: "A lounge where you find thoughts on software development, productivity, and life.",
	// HTML lang property, found in src/layouts/Base.astro L:18
	lang: "en-US",
	// Meta property, found in src/components/BaseHead.astro L:42
	ogLocale: "en_US",
	// Date.prototype.toLocaleDateString() parameters, found in src/utils/date.ts.
	date: {
		locale: "en-US",
		options: {
			day: "numeric",
			month: "short",
			year: "numeric",
		},
	},
	webmentions: {
		link: "https://webmention.io/andrei-calazans.com/webmention",
	},
};

// Used to generate links in both the Header & Footer.
export const menuLinks: Array<{ title: string; path: string }> = [
	{
		title: "Home",
		path: "/",
	},
	{
		title: "About",
		path: "/about/",
	},
	{
		title: "Blog",
		path: "/posts/",
	},
	{
		title: "Tags",
		path: "/tags",
	},
	{
		title: "RSS",
		path: "/rss",
	},
];
