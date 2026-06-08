---
title: "Exploring Inlined Requires: Does Expo Router Give You Screen-Level Lazy Loading?"
description: "Verifying whether Expo Router's file-based routing actually solves the eager-aggregator problem — require.context getters, getComponent thunks, and a probe proving route discovery loads zero screens."
publishDate: "2026-06-04"
tags: ["react-native", "expo-router", "performance", "metro", "navigation"]
---

Part of [Exploring Inlined Requires to Improve Cold Start](/posts/2026-06-01-exploring-inlined-requires/). The [previous post](/posts/2026-06-03-inlined-requires-eager-aggregators/) showed that the real startup killer is eager aggregators — navigation stacks that import every screen and reference them at module-init, so `inlineRequires` can't defer them. The manual fix is wrapping screens in `getComponent` thunks. Here I verify that **Expo Router does this for you**.

I built a small Expo Router app with an `_layout`, an index, and four leaf screens — each importing a uniquely-tagged heavy module — and pulled apart the export.

**The verdict: yes, lazy by default** — even in the default sync import mode, independent of `inlineRequires`.

## Routes live behind getters, not eager requires

Expo Router discovers routes with `require.context('./app')`, which Metro compiles into a context module whose entries are **enumerable getters**. Reading the key list doesn't load anything:

```js
var map = Object.defineProperties({}, {
  "./index.js": { enumerable: true, get() { return require(_dependencyMap[2]); } },
  "./one.js":   { enumerable: true, get() { return require(_dependencyMap[3]); } },
  "./two.js":   { enumerable: true, get() { return require(_dependencyMap[4]); } },
});
metroContext.keys = () => Object.keys(map); // lists routes without loading them
```

## Each screen is registered as a getComponent thunk

When Expo Router builds the React Navigation navigator, each route gets a thunk — not a resolved component:

```js
function routeToScreen(route) {
  return createElement(Screen, {
    name: route.route,
    getComponent: () => getQualifiedRouteComponent(route), // called on first navigation
  });
}
```

In sync mode (the native default), `getQualifiedRouteComponent` calls a synchronous `require` of that screen off the startup path. In lazy mode it returns `React.lazy(() => loadRoute())` behind `Suspense`.

## Proof: route discovery loads zero screens

I ran Expo Router's `getRoutes()` against an instrumented `require.context` that recorded every module load:

```text
$ node router_probe.js
Modules loaded during route discovery: [ './_layout.js' ]
Leaf routes behind lazy thunks:        [ 'index', 'one', 'two', 'heavy', '_sitemap', '+not-found' ]
Leaf modules loaded at discovery time: 0 / 6
```

Only `_layout` loads at discovery (to read `unstable_settings`). Every leaf screen — and transitively its heavy dependencies — stays unloaded until you navigate to it.

## Caveats

- **Layouts on the active path are eager.** They must render. Keep root `_layout` files light.
- **The initial route loads at startup** — it renders immediately; only the other routes are deferred.
- **Still one bundle on native.** Sync mode means a synchronous `require` on navigation, not a downloaded chunk. The deferral comes from `getComponent`, not bundle splitting.
- **Independent of `inlineRequires`.** This is an architecture win from the routing layer, not the transform.

If you're wiring `getComponent` thunks by hand across a large navigation stack, Expo Router's file-based routes are lazy by construction — and that's a strong argument for letting the routing layer own this instead of every team re-deriving the pattern.

<footer class="post-footnote">
Source: <a href="https://github.com/AndreiCalazans/metro-inlined-requires-research">AndreiCalazans/metro-inlined-requires-research</a> — run <code>node router_probe.js</code> in <code>expo-router-app/</code>. Part of <a href="/posts/2026-06-01-exploring-inlined-requires/">Exploring Inlined Requires to Improve Cold Start</a>.
</footer>
