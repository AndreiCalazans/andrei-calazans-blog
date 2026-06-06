---
title: "Does Expo Router Actually Give You Screen-Level Lazy Loading?"
description: "A teardown of how Expo Router defers screens by default — require.context getters, getComponent thunks, and a probe proving route discovery loads zero screens. The eager-aggregator fix from the inline-requires deep dive, for free."
publishDate: "2026-06-06"
tags: ["react-native", "expo-router", "performance", "metro", "navigation"]
draft: true
---

> This is **Part 2**. In [Part 1 — How Metro Inlined Requires Really
> Work](/posts/2026-06-06-how-metro-inlined-requires-work/) I dug into what `inlineRequires` does to
> the bundle, and ended on a war story: the real startup killer is **eager aggregators** — navigation
> stacks and routers that `import` every screen and reference them at module-init, so inline requires
> can't defer them. The manual fix is wrapping screens in `getComponent` / `React.lazy`. Here I verify
> that **Expo Router does exactly that for you**.

The field note ends on a manual fix: wrap screens in `getComponent` / `React.lazy` so a navigation
stack doesn't drag every screen into startup. **Expo Router promises to do exactly this for you** via
file-based routing. I wanted to verify it actually does — and how — so I built a small Expo Router app
(`app/_layout.js`, `index`, `one`, `two`, `heavy`, each screen importing a uniquely-tagged heavy
module) and pulled apart the export.

The verdict: **yes, and it's lazy by default** — even in the default "sync" import mode, and
independent of `inlineRequires`. Here's the machinery.

## ① Routes live behind getters, not eager requires

Expo Router discovers routes with `require.context('./app')`, which Metro compiles into a context
module whose entries are **enumerable getters** — the `require()` only fires when a key is read, and
listing the keys doesn't load anything:

```js
// the generated require.context module — note: requires are inside getters
var map = Object.defineProperties({}, {
  "./index.js": { enumerable: true, get() { return require(_dependencyMap[2]); } },
  "./one.js":   { enumerable: true, get() { return require(_dependencyMap[3]); } },
  "./two.js":   { enumerable: true, get() { return require(_dependencyMap[4]); } },
  // ...
});
metroContext.keys = () => Object.keys(map);  // lists routes WITHOUT loading them
```

## ② Each screen is registered as a `getComponent` thunk

When building the React Navigation navigator, Expo Router hands every route a _thunk_, not a resolved
component (from `useScreens.js`):

```js
function routeToScreen(route, ...) {
  return createElement(Screen, {
    name: route.route,
    getComponent: () => getQualifiedRouteComponent(route),  // lazy — called on first navigation
  });
}
```

React Navigation only invokes `getComponent()` when the screen is first navigated to. In the default
**sync** import mode (`EXPO_ROUTER_IMPORT_MODE` defaults to `'sync'` on native),
`getQualifiedRouteComponent` then calls `loadRoute()` — a synchronous `require` of that screen, off
the startup path. In **lazy** mode it instead returns `React.lazy(() => loadRoute())` behind
`Suspense`.

## ③ Proof: route discovery loads zero screens

Talk is cheap, so I ran Expo Router's _real_ `getRoutes()` against an instrumented `require.context`
that records every module load (`expo-router-app/router_probe.js` in the repo):

```text
$ node router_probe.js
Modules LOADED during route discovery: [ './_layout.js' ]
Leaf routes (each behind a lazy loadRoute thunk): [ 'index','one','two','heavy','_sitemap','+not-found' ]
Leaf modules loaded at discovery time: 0 / 6
```

Only the `_layout` loads at discovery (to read `unstable_settings`). Every leaf screen — and
transitively its heavy deps — stays unloaded until you navigate to it. This is precisely the
eager-aggregator fix from the field note, except the framework does it for you.

> **Caveats worth knowing**
>
> - **Layouts on the active path are eager** — they have to render. Keep `_layout` files light; heavy
>   work in a root layout loads at startup for everything beneath it.
> - **The initial route loads at startup** (it renders immediately); only the _other_ routes are
>   deferred.
> - **Still one bundle on native** — sync mode means a synchronous `require` on navigation, not a
>   downloaded chunk. `asyncRoutes` (the `React.lazy`/Suspense path, and real chunks on web) is
>   configured under `extra.router.asyncRoutes` and is web/dev-oriented; a production native export
>   stayed in `sync` mode in my tests. The deferral on native comes from `getComponent` either way.
> - **Independent of `inlineRequires`** — this is an architecture win from the router, not the
>   transform. (inlineRequires still defaults off here; the two are complementary.)

So if you're fighting eager navigation stacks by hand, file-based Expo Router routes are lazy by
construction — a strong argument for the routing layer doing this rather than every team re-deriving
the `getComponent` pattern.

<footer class="post-footnote">
Continues from <a href="/posts/2026-06-06-how-metro-inlined-requires-work/">Part 1 — How Metro Inlined Requires Really Work</a>. All setups, the shared app, the fixtures, and the full research notes live at <a href="https://github.com/AndreiCalazans/metro-inlined-requires-research">AndreiCalazans/metro-inlined-requires-research</a> — clone it and run <code>node router_probe.js</code> in <code>expo-router-app/</code> for the route-loading proof.
</footer>
