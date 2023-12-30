import { defineConfig } from "astro/config";
import fs from "fs";
import mdx from "@astrojs/mdx";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";
import remarkUnwrapImages from "remark-unwrap-images";
import rehypeExternalLinks from "rehype-external-links";
import { remarkReadingTime } from "./src/utils/remark-reading-time";

import netlify from "@astrojs/netlify";

// https://astro.build/config
export default defineConfig({
	site: "https://andrei-calazans.com/",
	redirects: {
		"/old-page": "/new-page",
		"/posts/2021-05-12/open-source-apps": "/posts/2021-05-12-open-source-apps",
		"/posts/2017-08-25/relay-is-just-getting-better":
			"/posts/2017-08-25-relay-is-just-getting-better",
		"/posts/2018-02-22/class-fields-arrow-functions":
			"/posts/2018-02-22-class-fields-arrow-functions",
		"/posts/2018-05-09/why-use-set-state": "/posts/2018-05-09-why-use-set-state",
		"/posts/2018-09-16/class-components-es6-class-fields":
			"/posts/2018-09-16-class-components-es6-class-fields",
		"/posts/2018-09-28/which-component-to-use": "/posts/2018-09-28-which-component-to-use",
		"/posts/2018-10-22/automated-storybook-flow": "/posts/2018-10-22-automated-storybook-flow",
		"/posts/2018-10-26/summary-react-conf-brazil": "/posts/2018-10-26-summary-react-conf-brazil",
		"/posts/2019-02-21/reasonml-flow-ts-function-inference":
			"/posts/2019-02-21-reasonml-flow-ts-function-inference",
		"/posts/2019-04-05/react-native-flatlist-with-hooks":
			"/posts/2019-04-05-react-native-flatlist-with-hooks",
		"/posts/2019-07-30/choose-between-flutter-react-native":
			"/posts/2019-07-30-choose-between-flutter-react-native",
		"/posts/2019-08-06/react-separation-of-concerns":
			"/posts/2019-08-06-react-separation-of-concerns",
		"/posts/2020-06-03/tv-apps-handling-focus-styling-in-cpp-for-performance-gains-with-react-native-youi":
			"/posts/2020-06-03-tv-apps-handling-focus-styling-in-cpp-for-performance-gains-with-react-native-youi",
		"/posts/2020-08-14/using-react-refs": "/posts/2020-08-14-using-react-refs",
		"/posts/2020-08-19/private-package-registry-bug":
			"/posts/2020-08-19-private-package-registry-bug",
		"/posts/2020-10-20/podcast-eli-white-react-native-principles":
			"/posts/2020-10-20-podcast-eli-white-react-native-principles",
		"/posts/2020-10-23/is-this-reducer-unpure": "/posts/2020-10-23-is-this-reducer-unpure",
		"/posts/2020-10-24/how-avoid-learned-helplessness":
			"/posts/2020-10-24-how-avoid-learned-helplessness",
		"/posts/2020-10-25/how-to-create-a-native-view-with-react-native-youi":
			"/posts/2020-10-25-how-to-create-a-native-view-with-react-native-youi",
		"/posts/2020-10-27/keeping-up-with-react-native":
			"/posts/2020-10-27-keeping-up-with-react-native",
		"/posts/2020-10-30/react-native-focused-animated-button-for-tenfoot":
			"/posts/2020-10-30-react-native-focused-animated-button-for-tenfoot",
		"/posts/2020-11-01/hooks-were-not-made-to-give-state-to-functions":
			"/posts/2020-11-01-hooks-were-not-made-to-give-state-to-functions",
		"/posts/2020-11-20/podcast-react-native-eu-qa-panel":
			"/posts/2020-11-20-podcast-react-native-eu-qa-panel",
		"/posts/2020-11-21/what-is-your-actionable-list":
			"/posts/2020-11-21-what-is-your-actionable-list",
		"/posts/2020-12-23/youi-extending-rn-comps-with-counterparts":
			"/posts/2020-12-23-youi-extending-rn-comps-with-counterparts",
		"/posts/2021-02-06/explicit-vs-implicit": "/posts/2021-02-06-explicit-vs-implicit",
		"/posts/2021-02-08/time-spent-on-comprehesion": "/posts/2021-02-08-time-spent-on-comprehesion",
		"/posts/2021-03-14/next-js-handling-linkable-tabs":
			"/posts/2021-03-14-next-js-handling-linkable-tabs",
		"/posts/2021-03-21/react-native-weekly": "/posts/2021-03-21-react-native-weekly",
		"/posts/2021-03-29/react-native-weekly": "/posts/2021-03-29-react-native-weekly",
		"/posts/2021-04-05/react-native-weekly": "/posts/2021-04-05-react-native-weekly",
		"/posts/2021-04-10/use-cases-for-react-class-comps":
			"/posts/2021-04-10-use-cases-for-react-class-comps",
		"/posts/2021-04-12/react-native-weekly": "/posts/2021-04-12-react-native-weekly",
		"/posts/2021-04-17/documentation-oriented-programming":
			"/posts/2021-04-17-documentation-oriented-programming",
		"/posts/2021-04-18/lead-engineering-teams-intrinsic-motivation":
			"/posts/2021-04-18-lead-engineering-teams-intrinsic-motivation",
		"/posts/2021-04-18/react-native-weekly": "/posts/2021-04-18-react-native-weekly",
		"/posts/2021-04-24/comments-on-lelands-prediction":
			"/posts/2021-04-24-comments-on-lelands-prediction",
		"/posts/2021-04-26/react-native-weekly": "/posts/2021-04-26-react-native-weekly",
		"/posts/2021-05-01/flexible-vs-rigid-systems": "/posts/2021-05-01-flexible-vs-rigid-systems",
		"/posts/2021-05-03/react-native-weekly": "/posts/2021-05-03-react-native-weekly",
		"/posts/2021-05-06/next-js-when-to-use-get-server-side-props":
			"/posts/2021-05-06-next-js-when-to-use-get-server-side-props",
		"/posts/2021-05-09/react-native-weekly": "/posts/2021-05-09-react-native-weekly",
		"/posts/2021-05-17/react-native-weekly": "/posts/2021-05-17-react-native-weekly",
		"/posts/2021-05-19/engineering-dep-questions-to-answer":
			"/posts/2021-05-19-engineering-dep-questions-to-answer",
		"/posts/2021-05-23/react-native-weekly": "/posts/2021-05-23-react-native-weekly",
		"/posts/2021-05-27/test-driven-learning": "/posts/2021-05-27-test-driven-learning",
		"/posts/2021-05-29/what-is-taiko": "/posts/2021-05-29-what-is-taiko",
		"/posts/2021-05-31/react-native-weekly": "/posts/2021-05-31-react-native-weekly",
		"/posts/2021-06-06/react-native-weekly": "/posts/2021-06-06-react-native-weekly",
		"/posts/2021-06-14/react-native-weekly": "/posts/2021-06-14-react-native-weekly",
		"/posts/2021-06-17/a-guide-to-managing-tech-teams":
			"/posts/2021-06-17-a-guide-to-managing-tech-teams",
		"/posts/2021-06-21/react-native-weekly": "/posts/2021-06-21-react-native-weekly",
		"/posts/2021-06-22/hiring-software-engineers": "/posts/2021-06-22-hiring-software-engineers",
		"/posts/2021-06-23/passing-secrets-github-actions-docker":
			"/posts/2021-06-23-passing-secrets-github-actions-docker",
		"/posts/2021-06-28/react-native-weekly": "/posts/2021-06-28-react-native-weekly",
		"/posts/2021-07-05/react-native-weekly": "/posts/2021-07-05-react-native-weekly",
		"/posts/2021-07-12/react-native-weekly": "/posts/2021-07-12-react-native-weekly",
		"/posts/2021-07-19/react-native-weekly": "/posts/2021-07-19-react-native-weekly",
		"/posts/2021-07-26/react-native-weekly": "/posts/2021-07-26-react-native-weekly",
		"/posts/2021-07-30/grid-view-for-react-native": "/posts/2021-07-30-grid-view-for-react-native",
		"/posts/2021-08-02/react-native-weekly": "/posts/2021-08-02-react-native-weekly",
		"/posts/2021-08-09/react-native-weekly": "/posts/2021-08-09-react-native-weekly",
		"/posts/2021-08-16/react-native-weekly": "/posts/2021-08-16-react-native-weekly",
		"/posts/2021-08-23/react-native-weekly": "/posts/2021-08-23-react-native-weekly",
		"/posts/2021-08-30/react-native-weekly": "/posts/2021-08-30-react-native-weekly",
		"/posts/2021-09-06/react-native-weekly": "/posts/2021-09-06-react-native-weekly",
		"/posts/2021-09-20/react-native-weekly": "/posts/2021-09-20-react-native-weekly",
		"/posts/2021-09-27/react-native-weekly": "/posts/2021-09-27-react-native-weekly",
		"/posts/2021-10-04/react-native-weekly": "/posts/2021-10-04-react-native-weekly",
		"/posts/2021-10-10/react-native-weekly": "/posts/2021-10-10-react-native-weekly",
		"/posts/2021-10-17/react-native-weekly": "/posts/2021-10-17-react-native-weekly",
		"/posts/2021-10-22/typing-higher-order-functions-ts":
			"/posts/2021-10-22-typing-higher-order-functions-ts",
		"/posts/2021-10-25/react-native-weekly": "/posts/2021-10-25-react-native-weekly",
		"/posts/2021-11-01/react-native-weekly": "/posts/2021-11-01-react-native-weekly",
		"/posts/2021-11-08/react-native-weekly": "/posts/2021-11-08-react-native-weekly",
		"/posts/2021-11-15/react-native-weekly": "/posts/2021-11-15-react-native-weekly",
		"/posts/2021-11-20/til-css-current-color-var": "/posts/2021-11-20-til-css-current-color-var",
		"/posts/2021-11-22/react-native-weekly": "/posts/2021-11-22-react-native-weekly",
		"/posts/2021-11-29/react-native-weekly": "/posts/2021-11-29-react-native-weekly",
		"/posts/2021-12-06/react-native-weekly": "/posts/2021-12-06-react-native-weekly",
		"/posts/2021-12-13/react-native-weekly": "/posts/2021-12-13-react-native-weekly",
		"/posts/2021-12-20/react-native-weekly": "/posts/2021-12-20-react-native-weekly",
		"/posts/2022-01-17/react-native-weekly": "/posts/2022-01-17-react-native-weekly",
		"/posts/2022-01-24/react-native-weekly": "/posts/2022-01-24-react-native-weekly",
		"/posts/2022-01-26/til-git-worktree": "/posts/2022-01-26-til-git-worktree",
		"/posts/2022-01-30/react-native-weekly": "/posts/2022-01-30-react-native-weekly",
		"/posts/2022-02-01/til-node-inspect-vs-inspect-brk":
			"/posts/2022-02-01-til-node-inspect-vs-inspect-brk",
		"/posts/2022-02-02/til-why-vim-fzf-wont-highlight":
			"/posts/2022-02-02-til-why-vim-fzf-wont-highlight",
		"/posts/2022-02-07/react-native-weekly": "/posts/2022-02-07-react-native-weekly",
		"/posts/2022-02-27/react-native-weekly": "/posts/2022-02-27-react-native-weekly",
		"/posts/2022-03-06/react-native-weekly": "/posts/2022-03-06-react-native-weekly",
		"/posts/2022-03-22/react-native-weekly": "/posts/2022-03-22-react-native-weekly",
		"/posts/2022-03-31/memoization-mistake-flatlist-renderitem":
			"/posts/2022-03-31-memoization-mistake-flatlist-renderitem",
		"/posts/2022-04-01/til-change-base-branch-on-git":
			"/posts/2022-04-01-til-change-base-branch-on-git",
		"/posts/2022-09-21/til-git-diff-file-filter": "/posts/2022-09-21-til-git-diff-file-filter",
		"/posts/2022-10-03/retriable-suspense-wrapper": "/posts/2022-10-03-retriable-suspense-wrapper",
		"/posts/2022-12-06/til-postfixed-403": "/posts/2022-12-06-til-postfixed-403",
		"/posts/2022-12-12/til-overriding-nodejs-module-with-metro":
			"/posts/2022-12-12-til-overriding-nodejs-module-with-metro",
		"/posts/2023-01-03/the-missing-semester-review":
			"/posts/2023-01-03-the-missing-semester-review",
		"/posts/2023-02-06/visible-component-react-native":
			"/posts/2023-02-06-visible-component-react-native",
		"/posts/2023-06-26/the-state-of-gpt-by-andrej": "/posts/2023-06-26-the-state-of-gpt-by-andrej",
		"/posts/2023-10-11/how-to-succeed-in-remote-work":
			"/posts/2023-10-11-how-to-succeed-in-remote-work",
		"/posts/2023-11-16/react-native-performance-book-course":
			"/posts/2023-11-16-react-native-performance-book-course",
	},
	markdown: {
		remarkPlugins: [remarkUnwrapImages, remarkReadingTime],
		rehypePlugins: [
			[
				rehypeExternalLinks,
				{
					target: "_blank",
					rel: ["nofollow, noopener, noreferrer"],
				},
			],
		],
		remarkRehype: {
			footnoteLabelProperties: {
				className: [""],
			},
		},
		shikiConfig: {
			theme: "dracula",
			wrap: true,
		},
	},
	integrations: [
		mdx({}),
		tailwind({
			applyBaseStyles: false,
		}),
		sitemap(),
	],
	// image: {
	// 	domains: ["webmention.io"],
	// },
	// https://docs.astro.build/en/guides/prefetch/
	prefetch: true,
	vite: {
		plugins: [rawFonts([".ttf"])],
		optimizeDeps: {
			exclude: ["@resvg/resvg-js"],
		},
		ssr: {
			noExternal: ["path-to-regexp", "svgo"],
			external: ["svgo"],
		},
	},
	output: "hybrid",
	adapter: netlify(),
});
function rawFonts(ext: Array<string>) {
	return {
		name: "vite-plugin-raw-fonts",
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore:next-line
		transform(_, id) {
			if (ext.some((e) => id.endsWith(e))) {
				const buffer = fs.readFileSync(id);
				return {
					code: `export default ${JSON.stringify(buffer)}`,
					map: null,
				};
			}
		},
	};
}
