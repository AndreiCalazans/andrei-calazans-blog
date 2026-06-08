---
title: "Exploring Inlined Requires: How They Really Work"
description: "What inlineRequires actually does to your bundle — before/after Metro output, why Expo keeps it off by default, why default imports defeat it on stock RN, and what rnx-kit's tree shaking really changes."
publishDate: "2026-06-02"
tags: ["react-native", "metro", "performance", "bundling", "hermes"]
---

Part of [Exploring Inlined Requires to Improve Cold Start](/posts/2026-06-01-exploring-inlined-requires/). I wired one shared app into three bundling setups — vanilla RN, Expo SDK 56, rnx-kit — and diffed the output.

> **Setup:** React Native 0.85.3 · Metro 0.84.4 · Expo SDK 56 · @rnx-kit/cli 2.0.1

## What the transform does

`inlineRequires` is a Babel transform inside `metro-transform-plugins`. It moves each `require()` from the top of the module factory to the first place the binding is used.

**Before — eager:**
```js
var _heavy = require(_dependencyMap[2]); // runs when this module loads
function onPress() { _heavy.heavyCompute(1000); }
```

**After — inlined:**
```js
function onPress() { require(_dependencyMap[2]).heavyCompute(1000); } // runs on first call
```

The module's top-level code now runs lazily — only when the first code path that needs it executes. That's the startup win. The module is still in the bundle; nothing is removed.

## Why react-native stays hoisted but your heavy module doesn't

Metro ships a default block list that is never inlined:

```js
// metro/src/lib/transformHelpers.js
const baseIgnoredInlineRequires = [
  "React", "react", "react/jsx-dev-runtime", "react/jsx-runtime",
  "react-compiler-runtime", "react-native",
];
```

These are used on basically every render. Inlining them would add a `require()` lookup on hot paths for zero startup benefit. Everything outside this list is fair game.

## Expo keeps inlineRequires off by default

This contradicts what most people believe. From `@expo/metro-config`:

```js
getTransformOptions: async () => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: false,   // ← off
  },
}),
```

The emitted Expo bundle confirms it — `_heavy` is eagerly required at module load. To get deferred evaluation on Expo, set `inlineRequires: true` in `metro.config.js` yourself.

## Default imports stay eager on stock RN

Even with `inlineRequires: true`, default and namespace imports slip through the transform. The plugin only matches bare `require()` calls. Babel's interop wrappers have different names, so the plugin ignores them:

```js
// Named import → bare require → inlined ✅
import { x } from 'm';
// compiled: var _m = require('m');  → moves to use site

// Default import → interop wrapper → stays hoisted ❌
import def from 'm';
// compiled: var _m = _interopRequireDefault(require('m'));  → stays eager
```

Most third-party packages are default imports (`import React`, `import moment`, `import axios`). On stock RN they all stay eager even with the flag on.

**The fix:** let Metro lower imports instead of Babel. Set `disableImportExportTransform: true` on `@react-native/babel-preset` and keep `experimentalImportSupport: true`. Expo already does this — its bundle factories use `_$$_IMPORT_DEFAULT`/`_$$_IMPORT_ALL`, which the plugin does match.

| Import shape | Stock RN (Babel lowers) | Expo / Metro lowers |
| --- | --- | --- |
| `import { x } from 'm'` | inlined | inlined |
| `import x from 'm'` | eager | inlined |
| `import * as x from 'm'` | eager | inlined |

## import() in RN doesn't split the bundle

Adding `await import('./lazy')` compiles to an async require of an already-bundled module:

```js
// import('./lazy') becomes:
var e = (yield _r(d[9])(d[8], d.paths)).lazyGreeting;
//          ^asyncRequire — module still lives in this bundle
```

No separate chunk is emitted. `import()` in React Native means deferred evaluation, not code splitting. Splitting is a Metro/Expo web feature.

> Hermes already lazy-compiles function bodies on first call, which reduces the value of inline requires. The remaining win is deferring module **top-level evaluation** — side effects, object construction — not parse cost.

## rnx-kit actually shrinks the bundle

rnx-kit's `--tree-shake` hands the module graph to esbuild, which does real dead-code elimination. With one unused export in the fixture:

| Setup | Size | Unused export |
| --- | ---: | --- |
| Vanilla `inlineRequires: false` | 992 KB | present |
| Vanilla `inlineRequires: true` | 993 KB | present |
| rnx-kit `--tree-shake` | 807 KB | **removed** |

Gotcha: esbuild only tree-shakes ESM. `@react-native/babel-preset` rewrites imports to CommonJS by default, which esbuild can't analyse. Set `disableImportExportTransform: true` in your production build or you'll get the esbuild output format with no actual DCE.

## The full picture

| Setup | Defers evaluation? | Shrinks bundle? | Output |
| --- | --- | --- | --- |
| Vanilla `inlineRequires: false` | no | no | Metro `__d` JS |
| Vanilla `inlineRequires: true` | named imports only | no | Metro `__d` JS |
| Expo default | no | no | Hermes `.hbc` |
| rnx-kit `--tree-shake` | — | yes, ~19% | esbuild IIFE |

Inline requires is a startup lever, not a size lever. And if you turn it on and the profile barely moves, the problem is probably structural — [next post](/posts/2026-06-03-inlined-requires-eager-aggregators/).

<footer class="post-footnote">
Source: <a href="https://github.com/AndreiCalazans/metro-inlined-requires-research">AndreiCalazans/metro-inlined-requires-research</a> — one shared app bundled three ways. Part of <a href="/posts/2026-06-01-exploring-inlined-requires/">Exploring Inlined Requires to Improve Cold Start</a>.
</footer>
