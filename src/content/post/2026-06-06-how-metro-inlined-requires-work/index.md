---
title: "How Metro Inlined Requires Really Work (Vanilla RN vs Expo vs rnx-kit)"
description: "A hands-on teardown of the final bundle output across vanilla React Native, Expo, and rnx-kit — what inline requires actually do to the bytes Metro and esbuild emit, why Expo doesn't enable them by default, and why your inlineRequires win might be disappointing."
publishDate: "2026-06-06"
tags: ["react-native", "metro", "performance", "bundling", "hermes"]
draft: true
---

> **TL;DR:** Inline requires moves `require()` to the first use site to defer _evaluation_ — it
> does **not** remove code and does **not** split the bundle. Expo SDK 56 does **not** enable inline
> requires by default (it uses `experimentalImportSupport`). Only rnx-kit's esbuild tree-shaking
> actually shrinks the bundle (≈19% here). In React Native there is one bundle; `import()` defers
> evaluation, it doesn't create chunks.

> **Setup:** React Native 0.85.3 · Metro 0.84.4 · Expo SDK 56 · @rnx-kit/cli 2.0.1

Everyone "knows" you should flip on `inlineRequires` for faster React Native startup. But what does
that flag actually do to the bytes that ship? Does Expo do it for you? Does rnx-kit do something
fundamentally different? I wired a **single shared app** into three real bundling setups and diffed
the output. The results had a couple of genuine surprises.

The questions I set out to answer:

1. How do inlined requires work?
2. What does the bundle look like with `inlineRequires: true`?
3. How does Expo change Metro's behavior?
4. Does Metro support bundle splitting? Does Hermes benefit?
5. When you want to defer JS work, what pattern should you use?
6. How does rnx-kit help?

This is **Part 1**. [Part 2](/posts/2026-06-06-expo-router-screen-level-lazy-loading/) takes the
"eager aggregator" problem from the field note below and verifies that Expo Router fixes it for you
with screen-level lazy loading.

## The test setup

All three setups consume the exact same `shared-app/src/App.js`. The trick is to import modules at
the _top_ of the file but only use them inside event handlers — that's the shape that makes the
inline-requires transform visible in the output.

```js
// shared-app/src/App.js — top-level imports, but used only in handlers
import { heavyCompute, HEAVY_TAG } from './heavy';
import { formatRare } from './rarely-used';

export default function App() {
  const runHeavy = () => {
    const result = heavyCompute(1000);   // first use of heavy
    setOutput(`${HEAVY_TAG}: ${result}`);
  };
  const runRare  = () => setOutput(formatRare('inlined requires'));
  const runLazy  = async () => {
    const { lazyGreeting } = await import('./lazy');  // dynamic import
    setOutput(lazyGreeting());
  };
  /* ...renders Buttons wired to the handlers... */
}
```

| Folder | Stack | Bundler command |
| --- | --- | --- |
| `vanilla-rn/` | RN 0.85.3 + Metro 0.84.4 | `react-native bundle` |
| `expo-app/` | Expo SDK 56 | `expo export` |
| `rnx-kit-app/` | @rnx-kit/cli + esbuild serializer | `rnx-cli bundle` |

## 1 · How do inlined requires work?

Inline requires is a Babel transform (`metro-transform-plugins` → `inline-requires`). It rewrites a
module so that `require()` calls are **not executed at module-load time**. Instead, each `require()`
is moved to — inlined at — the **first place the binding is used**.

**Before — eager (runs on module load):**

```js
var _heavy = require(_dependencyMap[2]); // evaluated when this module loads
function onPress() { _heavy.heavyCompute(1000); }
```

**After — inline / lazy (runs on first use):**

```js
// no top-level require for heavy
function onPress() { require(_dependencyMap[2]).heavyCompute(1000); }
```

Three things follow from this:

- The imported module's **top-level code runs lazily** — only when the path that needs it first
  executes. That's the startup / time-to-interactive win.
- It's purely a _when-does-it-evaluate_ change. The module is **still in the bundle**; nothing is
  removed or split out.
- Not _every_ `require` gets inlined. There's a default block list (and a couple of shape rules) —
  see below.

### Wait — why did `react-native` stay at the top but `heavy` got inlined?

My first instinct was "bindings used during render stay hoisted, bindings used only in deferred code
get inlined." **That's wrong**, and it's worth correcting because it's a common misconception. The
real rules are mechanical, and they live in the transform — not in any analysis of "is this on the
render path."

The plugin (`metro-transform-plugins → inline-requires`) walks the module, finds each top-level
`var x = require(…)`, and rewrites **every** reference to `x` into an inline `require(…)` at the use
site, then deletes the top declaration. It would happily do that to `react-native` too. Two things
stop it:

- **A default block list** (`nonInlinedRequires`). Metro ships `baseIgnoredInlineRequires` and never
  inlines these:

  ```js
  // metro/src/lib/transformHelpers.js
  const baseIgnoredInlineRequires = [
    "React", "react", "react/jsx-dev-runtime", "react/jsx-runtime",
    "react-compiler-runtime", "react-native",
  ];
  ```

  These modules are needed on basically every render, so inlining them would just add a (cheap, but
  pointless) `require()` lookup to hot paths for zero startup benefit. `heavy` and `rare` aren't on
  the list, so they get inlined.

- **Requires wrapped in an interop helper aren't matched.** `import x from 'm'` compiles to
  `var x = _interopRequireDefault(require('m'))`. The thing assigned isn't a bare `require()` call,
  so the plugin leaves it alone. That's why the Babel runtime helpers (`slicedToArray`,
  `asyncToGenerator`) and `React` (imported as a default + namespace) stayed hoisted as well.

To prove it wasn't about "render path," I emptied the block list (`nonInlinedRequires: []`) and
rebuilt. Now `react-native` and the JSX runtime _do_ get inlined straight into the JSX — exactly
like `heavy`:

```js
// inlineRequires:true + nonInlinedRequires:[]  (block list emptied)
return(0,_r(d[8]).jsxs)(_r(d[9]).View, { ... });
//        ^jsx-runtime inlined   ^react-native inlined — no top-level vars left
```

One more detail: by default inline requires is **not memoized**
(`unstable_memoizeInlineRequires: false`), so a module used twice in a handler emits the `require()`
twice (e.g. `_r(d[6]).heavyCompute` and `_r(d[6]).HEAVY_TAG`). That's fine — `require()` is just a
cached lookup into the module registry after first evaluation.

### How this differs from a manual inline `require()` or `React.lazy`

The `inlineRequires` flag is the _automatic, synchronous_ version of a pattern you can also do by
hand. These three express increasingly explicit deferral:

```js
// 1. Automatic — the inlineRequires transform does this for you, no async:
import { heavyCompute } from './heavy';
const onPress = () => heavyCompute(1000);   // require('./heavy') moved here at build time

// 2. Manual inline require — same idea, written explicitly, still synchronous:
const onPress = () => require('./heavy').heavyCompute(1000);

// 3. React.lazy — ASYNC; built on dynamic import(), used for whole components:
const Screen = React.lazy(() => import('./HeavyScreen'));
// <Suspense fallback={...}><Screen/></Suspense>
```

Options 1 and 2 are **synchronous**: the module is evaluated the first time the handler runs, on the
same tick. `React.lazy` is **asynchronous** — it takes a function returning a _Promise_ of
`{ default: Component }`, and Metro compiles that `import()` into an `asyncRequire(moduleId)` (we'll
see this in section 4). React's `Suspense` shows a fallback until the promise resolves. Crucially, in
React Native this _still_ resolves a module that's already in the same bundle — `React.lazy` defers
evaluation behind an async boundary, it does not download a separate chunk. So:

- **inline require (auto or manual)** → defer evaluation of a synchronous dependency, no code change
  needed (auto), no async boundary, no `Suspense`.
- **`React.lazy` / `import()`** → defer evaluation of a heavier unit (often a whole screen) behind an
  explicit `Promise` + `Suspense` boundary; lets you render a fallback while it initializes.

## 2 · What does the bundle look like with `inlineRequires: true`?

I built `vanilla-rn/` twice with configs that differ only in
`transformer.getTransformOptions().transform.inlineRequires`. Here is the actual emitted `App` module
factory (Metro wraps every module in `__d(factory, moduleId, dependencyMap)`).

**`inlineRequires: false` — all requires hoisted & evaluated at module init:**

```js
// tail of the factory: every dependency required up-front
...,o=_r(d[4]),u=_r(d[5]),i=_r(d[6])},2,[1,3,9,11,504,505,257]);
//        ^heavy    ^rare  evaluated on load
onPress:()=>{ (0,o.heavyCompute)(1e3) }   // uses pre-required binding `o`
```

**`inlineRequires: true` — block-listed requires (react, react-native, jsx) stay at top; the rest
move to the use site:**

```js
...,n=_r(d[3]),o=_r(d[4])},2,[1,3,9,11,243,502,503]);  // react-native + jsx only

onPress:()=>{ var e=(0,_r(d[5]).heavyCompute)(1e3); _r(d[5]).HEAVY_TAG }
onPress:()=>{ _r(d[6]).formatRare('inlined requires') }
```

Notice `react-native` stays hoisted as `n=_r(d[3])` (it's on Metro's default block list, see
section 1), while `heavy` and `rare` got pushed _into_ the click handlers.

| Measure | Value | Detail |
| --- | --- | --- |
| Module count | 506 → 504 | essentially unchanged |
| Bundle size | 992 KB | eager 992,261 B vs inline 993,386 B — inline is even _bigger_ |
| Heavy module | still shipped | `HEAVY_MODULE_LOADED` present in both |

> **The mental model that matters:** Inline requires is a **startup-time optimization, not a size
> optimization**, and it is **not dead-code elimination**. It changes _when_ a module's top-level
> code runs, never _whether_ it ships.

## 3 · How does Expo change Metro's behavior?

Two meaningful differences in Expo SDK 56 — and one of them is the biggest surprise of this whole
experiment.

### ① Output format: Hermes bytecode by default

`expo export` emits **Hermes bytecode** (`.hbc`), not JavaScript. You need `--no-bytecode` to get
readable JS. By contrast `react-native bundle` emits JS and Hermes compilation is a separate step.

```text
# Expo default output
_expo/static/js/ios/index-6d947bbb….hbc   (1.6 MB, Hermes bytecode)

# with --no-bytecode
_expo/static/js/ios/index-6d947bbb….js    (readable JavaScript)
```

### ② Expo does _not_ enable inline requires by default

This contradicts the widespread belief that "Expo turns inline requires on for you." Straight from
`@expo/metro-config`'s `ExpoMetroConfig.js`:

```js
getTransformOptions: async () => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: false,   // <- NOT inlined by default
  },
}),
```

So the Expo default keeps requires **eager** (confirmed in the emitted bundle):

```js
var _react = require(_dependencyMap[0]);
var _reactNative = require(_dependencyMap[1]);
var _heavy = require(_dependencyMap[2]);        // eager in Expo default!
var _rarelyUsed = require(_dependencyMap[3]);   // eager in Expo default!
```

> **Surprise:** If you want deferred evaluation on Expo, you must enable `inlineRequires: true`
> yourself in `metro.config.js`. It composes fine with `experimentalImportSupport` — I verified that
> forcing it on pushes the `heavy`/`rare` requires back into the handlers, exactly like vanilla.
>
> Scope caveat: this is plain Expo. **Expo Router** adds its own routing behavior on top — see
> [Part 2](/posts/2026-06-06-expo-router-screen-level-lazy-loading/), where its file-based routes
> turn out to be lazy by default.

Expo also ships an _experimental_ tree-shaking / "reconcile" serializer (`treeShakeSerializerPlugin`,
gated behind `EXPO_UNSTABLE_TREE_SHAKING`) that can re-run the transform with
`inlineRequires`/`nonInlinedRequires` and actually drop code — but it's off by default.

## 4 · Does Metro support bundle splitting? Does Hermes benefit?

**In React Native: no real bundle splitting.** A production React Native build emits a single bundle
(then, with Hermes, a single `.hbc`). I added `await import('./lazy')` to test it. Metro compiles
`import()` into an **async require of an already-bundled module**:

```js
// import('./lazy') becomes asyncRequire(moduleId, paths)
var e = (yield _r(d[9])(d[8], d.paths)).lazyGreeting;
//          ^asyncRequire  ^moduleId of ./lazy (still in this bundle)
```

The lazy module still ships inside the one bundle (`LAZY_CHUNK_EVALUATED` is present), and **no
separate chunk file is emitted** by either `react-native bundle` or `expo export`. So `import()` in
React Native = deferred _evaluation_, not code splitting. Multi-chunk splitting is a Metro/Expo _web_
feature.

> **The Hermes angle:** Hermes precompiles the whole bundle to bytecode and **lazily compiles
> function bodies on first call**. That already avoids eagerly parsing everything at startup, which
> makes RAM bundles obsolete and _reduces_ the value of inline requires. The remaining win under
> Hermes is deferring module **top-level evaluation** (side effects, object construction) — not parse
> cost. Hermes does not benefit from "splitting" because there's no separate-chunk loading in React
> Native.
>
> That said, deferral still helps **cold start**: whatever you keep off the startup path — bytecode
> parsing/compilation of a function on first call, plus the module's top-level evaluation — simply
> doesn't run at launch. The work isn't eliminated, it's moved to _when the feature is actually
> used_, which is exactly what you want for time-to-interactive.

## 5 · When you want to defer JS work, what pattern should you use?

In order of leverage:

1. **`inlineRequires: true`** — cheapest, global; defers module top-level evaluation until first use.
   A good default for startup. (On Expo you must enable it explicitly. Note that
   [Expo Router](/posts/2026-06-06-expo-router-screen-level-lazy-loading/) separately makes screens
   lazy by default, independent of this flag.)
2. **Dynamic `import()` / `React.lazy` + `Suspense`** for genuinely on-demand-heavy work (a screen, a
   parser, a charting lib). In React Native it won't split files, but it moves evaluation off the
   startup path behind an explicit async boundary.
3. **Don't do work at module top-level.** Keep side-effectful init inside functions so inline
   requires / `import()` can actually defer it. Inline requires can't help a module whose work runs
   at import time on the startup path.
4. If you want to defer _and_ care about size, you also need **tree shaking** — deferral alone never
   reduces what ships.

## 6 · How does rnx-kit help?

rnx-kit's headline feature here is **real tree shaking / dead-code elimination (DCE)** — removing
exports and modules that are never used so they don't ship — via the **esbuild serializer**
(`@rnx-kit/metro-serializer-esbuild`), enabled with `rnx-cli bundle --tree-shake`. The serializer
hands Metro's module graph to esbuild, which does scope hoisting and tree shaking. The output is a
completely different artifact — an esbuild IIFE bundle, not Metro's `__d(...)` registry:

```js
// esbuild output (unminified) — note the readable file-path comments
(() => {
  var __commonJS = (cb, mod) => function __require() { ... };

  // node_modules/@react-native/js-polyfills/console.js
  var require_console = __commonJS({
    "node_modules/@react-native/js-polyfills/console.js"(exports) { ... }
  });
```

> **The gotcha that cost me real DCE:** esbuild can only tree-shake **ESM**. But
> `@react-native/babel-preset` rewrites `import/export` to CommonJS by default, which esbuild treats
> as opaque — so nothing gets dropped. The fix is `disableImportExportTransform: true` for the
> production tree-shake build (or use `@rnx-kit/babel-preset-metro-react-native`). Until I set that,
> the unused export survived and the bundle didn't shrink at all.

With ESM preserved, the results are dramatic. I added a deliberately unused export
(`deadExport → 'DEAD_CODE_MARKER_SHOULD_BE_REMOVED'`):

| Measure | Value | Detail |
| --- | --- | --- |
| Unused export | removed | present in vanilla/Expo, gone here |
| Minified size | 992 → 807 KB | ≈19% smaller, across the whole graph |
| Output | esbuild IIFE | + `--metafile` for analysis |

Beyond tree shaking, rnx-kit also adds duplicate- and cyclic-dependency detection, robust
monorepo/symlink resolution (`@rnx-kit/metro-config`), esbuild metafile bundle analysis, and
dependency alignment (`align-deps`). What it does **not** magically add is true React Native bundle
splitting into separately-loaded chunks — that remains a web concept.

## The whole picture, on one app

Same shared app, minified, iOS:

| Setup | What it does to requires | Tree-shakes? | Output | Size |
| --- | --- | --- | --- | --- |
| Vanilla — `inlineRequires: false` | eager, top of module | no | Metro `__d` JS | 992 KB |
| Vanilla — `inlineRequires: true` | move `require()` to first use | no | Metro `__d` JS | ~992 KB |
| Expo (default) | eager (`experimentalImportSupport`) | no | Hermes `.hbc` | 1.6 MB\* |
| rnx-kit `--tree-shake` | esbuild scope hoisting | **yes** | esbuild IIFE | 807 KB |

\*Expo's plain minified JS was ~1 MB; the `.hbc` is bytecode, so it isn't directly size-comparable.
The takeaway: inline requires barely moves _size_ — it's a startup/TTI lever. Tree shaking is the
only one of these that meaningfully shrinks the bundle.

> **Final takeaways**
>
> ① Inline requires defers _evaluation_, not inclusion — a startup win, not a size win.<br/>
> ② Expo SDK 56 ships `inlineRequires: false` by default; enable it yourself if you want it.<br/>
> ③ React Native is always one bundle — `import()` defers, it doesn't split; Hermes already
> lazy-compiles.<br/>
> ④ Want a smaller bundle? You need tree shaking, and rnx-kit's esbuild path is the practical way to
> get it.<br/>
> ⑤ If turning on inline requires barely helps, look for _eager aggregators_ (navigation stacks,
> routers) — they use imports at module-init, so only lazy registration fixes them.
> [(field note)](#field-note--the-day-we-turned-on-inline-requires-and-almost-nothing-happened)<br/>
> ⑥ Expo Router gives screen-level lazy loading by default (via React Navigation's `getComponent`
> thunk) — the eager-aggregator fix, for free.
> [(Part 2)](/posts/2026-06-06-expo-router-screen-level-lazy-loading/)

## Annex — `_interopRequireDefault` & the import shape that quietly defeats inline requires

A reader question that deserves its own section: the post mentions that requires "wrapped in an
interop helper aren't matched" by the inline-requires plugin. **When does that wrapper get added —
and does it mean a lot of modules silently stay eager even with `inlineRequires: true`?** Short
answer: it depends entirely on _who lowers your ESM imports_, and on a default React Native setup the
answer is "yes, more than you'd think."

### When is `_interopRequireDefault` (or `_interopRequireWildcard`) added?

These are **Babel** helpers, emitted by `@babel/plugin-transform-modules-commonjs` (which
`@react-native/babel-preset` runs by default). The helper depends on the _kind_ of import — not the
module:

```js
// 1. NAMED import  ->  bare require(), NO interop helper
import { named } from 'm';
// becomes: var _m = require('m');            _m.named

// 2. DEFAULT import  ->  _interopRequireDefault wrapper
import def from 'm';
// becomes: var _m = _interopRequireDefault(require('m')); _m.default

// 3. NAMESPACE import  ->  _interopRequireWildcard wrapper
import * as ns from 'm';
// becomes: var _m = _interopRequireWildcard(require('m')); _m.anything
```

The wrappers exist to faithfully emulate ESM semantics over CommonJS: a default import has to resolve
to `module.exports.default` if the dependency is a real ES module (`__esModule` flag set), or to
`module.exports` itself if it's a plain CommonJS module; the wildcard helper builds a frozen namespace
object with a `default` key. So you get an interop wrapper precisely when you use a **default** or
**namespace** import — which is an _enormous_ fraction of real apps (`import React`, `import moment`,
`import axios`, `import * as d3`…).

### Why the wrapper dodges the inline-requires plugin

The plugin only treats three call shapes as "inlineable" (from `metro-transform-worker`):

```js
inlineableCalls: [importDefault, importAll]   // + bare require() is always inlineable
```

Here `importDefault`/`importAll` are **Metro's** runtime helpers (`_$$_IMPORT_DEFAULT` /
`_$$_IMPORT_ALL`), not Babel's. Babel's `_interopRequireDefault` / `_interopRequireWildcard` have
different names, so the plugin doesn't recognize them and leaves those declarations hoisted. Net
effect on a default RN setup:

- Named imports & raw `require()` → **inlined** ✅
- Default imports & namespace imports → **stay eager** ❌ (even with `inlineRequires: true`)

### Proof: same fixture, two lowering paths

One entry imports a default-export, a named-export, and a namespace — all used only inside `run()`:

```js
import def from './def';          // default
import { named } from './named';  // named
import * as star from './star';   // namespace
export function run() { return def() + named() + star.alpha() + star.beta(); }
```

**Babel lowering — the React Native default (`inlineRequires: true`):**

```js
// default & namespace stay hoisted; only the named import is inlined
.run=function(){ return(0,t.default)()+(0,_r(d[3]).named)()+r.alpha()+r.beta() };
var t=e(_r(d[1])),r=(/* _interopRequireWildcard */)(_r(d[2]));  // EAGER
```

**Metro lowering — `disableImportExportTransform: true` + `experimentalImportSupport: true`:**

```js
// every import inlined into run(); no top-level require vars at all
.run=function(){ return i(d[0])()+r(d[1]).named()+a(d[2]).alpha()+a(d[2]).beta() }},0,[1,2,3]);
//          ^_$$_IMPORT_DEFAULT      ^require           ^_$$_IMPORT_ALL
```

> **The catch the question is pointing at:** On a **stock React Native** project (Babel lowers ESM),
> flipping on `inlineRequires` does _nothing_ for any module you pull in via `import X from 'm'` or
> `import * as X from 'm'` — they're wrapped in `_interopRequireDefault` / `_interopRequireWildcard`
> and stay eager. If your heavy dependencies are default/namespace imports (most are), the startup
> win can be much smaller than expected.

### How to actually get the deferral

- **Let Metro lower imports instead of Babel.** Set `disableImportExportTransform: true` on
  `@react-native/babel-preset` and keep `experimentalImportSupport: true`. Now default/namespace
  imports compile to the inlineable `_$$_IMPORT_DEFAULT`/`_$$_IMPORT_ALL` helpers.
- **Expo already does this.** Its bundle factories are
  `function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, …)` — Metro lowering is on by
  default (which is also why Expo can run its experimental tree-shaking). The only thing Expo leaves
  off is `inlineRequires` itself.
- **rnx-kit** reaches the same place from the other direction: its esbuild path needs ESM preserved
  (`disableImportExportTransform`) and then esbuild does scope hoisting + DCE, so the "interop wrapper
  blocks inlining" problem doesn't apply at all.
- **Cheap heuristic:** prefer `import { thing } from 'm'` (named) over `import m from 'm'` when you
  can — named imports inline even under the stock Babel pipeline.

| Import shape | Babel lowering (stock RN) | Metro lowering (Expo / disable+IS) |
| --- | --- | --- |
| `import { x } from 'm'` | inlined | inlined |
| `const x = require('m')` | inlined | inlined |
| `import x from 'm'` | eager (`_interopRequireDefault`) | inlined (`_$$_IMPORT_DEFAULT`) |
| `import * as x from 'm'` | eager (`_interopRequireWildcard`) | inlined (`_$$_IMPORT_ALL`) |

(Block-listed modules — react, react-native, jsx runtimes — stay eager in _both_ columns regardless;
see section 1.)

## Field note — the day we turned on inline requires and (almost) nothing happened

Here's the war story that motivated half of this post. On a large app at work we flipped
`inlineRequires` to `true`, expecting a nice startup win… and the needle barely moved. The transform
was doing its job — requires _were_ being moved to use sites — but the startup graph stayed almost as
eager as before. Pulling apart a production bundle (tens of thousands of modules, ~85% of its
`require` calls sitting in eager `var x = require(d[n])` hoists) explained why.

The problem wasn't the modules inline requires _can_ defer — it was a big structural class of modules
it **can't**: what I'll call **eager aggregators**. Remember the rule from section 1: the plugin
moves a `require` to its _first use_. If the first use is at module top-level — i.e. the module runs
the imported code _while it is being evaluated_ — there's nowhere lazier to move it. It stays eager.

### Navigation stacks are the canonical offender

A typical navigation stack imports every screen and then builds the navigator at module-init:

```js
// AppStack.js — imports ALL screens, uses them immediately
import Home from './HomeScreen';
import Settings from './SettingsScreen';
import Profile from './ProfileScreen';
// ...200 more screens

export const AppStack = createStack([
  { name: 'Home',     component: Home },      // used at module-init
  { name: 'Settings', component: Settings },
  { name: 'Profile',  component: Profile },
  // ...
]);
```

Even with `inlineRequires: true`, the screen bindings are consumed inside the `createStack([...])`
argument, which executes the moment `AppStack` is required. So the compiled module is just a wall of
eager requires:

```js
// what inline requires CANNOT improve — first use is module-init
var Home=i(d[0]),Settings=i(d[1]),Profile=i(d[2]),/* …200 more eager requires… */;
_e.AppStack=createStack([{name:'Home',component:Home},{name:'Settings',component:Settings},/*…*/]);
```

Requiring this _one_ module synchronously drags in 200+ screen subtrees. In the bundle I analyzed
there were **well over a thousand** of these eager aggregators — navigation stacks, deep-link
URL→destination routers (a routing table that references every destination module at init), and
config objects assembled at load time — collectively pulling tens of thousands of eager dependency
edges into startup. `inlineRequires` can't touch any of them, which is exactly why flipping the flag
felt like a no-op.

> **The fix is structural, not a flag.** Make the screen references _lazy_ so the `require` lives
> inside a thunk that runs on navigation, not at module load:

```js
export const AppStack = createStack([
  { name: 'Home', getComponent: () => require('./HomeScreen').default },
  // or: React.lazy(() => import('./HomeScreen'))
]);
```

Now each screen is a deferred require (React Navigation's `getComponent`) or an async chunk boundary
(`React.lazy` + `Suspense`). This is the change that actually moved our startup numbers — far more
than the global flag did.

### The full list of what falls through inline requires

If you flip the flag and don't see the win you expected, it's almost certainly one of these
eager-by-nature categories:

| Category | Why it stays eager | What helps |
| --- | --- | --- |
| Block-listed (`react`, `react-native`, jsx runtimes) | Excluded by Metro's `nonInlinedRequires` on purpose | nothing — and you don't want to |
| Side-effect-only imports (`import './polyfill'`) | No binding to move; emitted as a bare top-level `require()` | only import them where actually needed |
| **Module-init usage** (nav stacks, routers, HOCs, `class extends`, styled-components, store/saga registration) | First use _is_ module evaluation → nowhere lazier to move it | `getComponent` / `React.lazy` / explicit `() => require()` thunks |
| Whole-namespace `import * as ns` used as a unit | Spreading/enumerating the namespace forces the full module | access `ns.member` in deferred code instead |
| Babel-interop default/namespace imports | `_interopRequireDefault` isn't matched (see annex) | let Metro lower imports (Expo already does) |

### Barrels, one more time — but now with the aggregator lens

Barrel files split into three behaviors, and only one of them is a problem inline requires can fix:

- **Re-export barrels** (`export { x } from './x'`) compile to live-binding getters. With
  `inlineRequires` on, each source `require` moves into its getter and goes lazy — _these the flag
  actually helps._
- **Eager aggregators** (the nav-stack/router shape above) reference their imports at init — _the
  flag does nothing; you need lazy registration._
- **Lazy registries** (source-authored `() => require()` thunk maps, e.g. an icon registry) are
  already deferred and ideal — aim for this shape when you build aggregators.

And remember Metro doesn't tree-shake: even unused re-exports ship, so importing one symbol from a
giant barrel still wires up the whole thing.

> **If your `inlineRequires` win is disappointing:** Don't assume the transform is broken. Open the
> bundle and look for **eager aggregators** — modules that `require` dozens of others and use them at
> load time (navigation stacks and routing tables first). Inline requires can't defer module-init
> work; that needs `getComponent` / `React.lazy` / thunked registration. The flag and the refactor
> are complementary, and the refactor is usually where the startup time actually goes.

---

**Next:** [Part 2 — Does Expo Router actually give you screen-level lazy
loading?](/posts/2026-06-06-expo-router-screen-level-lazy-loading/) verifies that file-based routing
solves the eager-aggregator problem for you, with a probe proving route discovery loads zero screens.

<footer class="post-footnote">
Built by bundling one shared React Native app three ways and reading the bytes. Reproduce: bundle in <code>vanilla-rn/</code>, <code>expo-app/</code>, and <code>rnx-kit-app/</code> — full source at <a href="https://github.com/AndreiCalazans/metro-inlined-requires-research">AndreiCalazans/metro-inlined-requires-research</a>.
</footer>
