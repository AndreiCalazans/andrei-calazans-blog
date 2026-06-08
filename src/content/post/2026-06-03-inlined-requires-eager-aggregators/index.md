---
title: "Exploring Inlined Requires: When Flipping the Flag Does Nothing"
description: "We turned on inlineRequires on a large production app and the startup profile barely moved. The reason: eager aggregators — modules that require dozens of others at init time, which the transform structurally cannot defer."
publishDate: "2026-06-03"
tags: ["react-native", "metro", "performance", "bundling"]
---

Part of [Exploring Inlined Requires to Improve Cold Start](/posts/2026-06-01-exploring-inlined-requires/).

We flipped `inlineRequires: true` on a large production app. The transform was working — requires _were_ moving to use sites. The startup profile barely moved.

## Why: eager aggregators

The transform moves a `require()` to its first use site. If the first use is at module top-level — the module consumes the imported value *while it is being evaluated* — there is nowhere lazier to move it.

Navigation stacks are the canonical case:

```js
// AppStack.js
import Home from './HomeScreen';
import Settings from './SettingsScreen';
// ... 200 more screens

export const AppStack = createStack([
  { name: 'Home',     component: Home },      // used at module-init
  { name: 'Settings', component: Settings },
]);
```

The screen bindings are consumed inside `createStack([...])`, which runs the moment `AppStack` is loaded. The compiled output is a wall of eager requires the transform cannot touch:

```js
var Home=i(d[0]),Settings=i(d[1]),/* …200 more… */;
_e.AppStack = createStack([{ name:'Home', component:Home }, ...]);
```

Requiring `AppStack` synchronously drags in 200+ screen subtrees. In the bundle we analyzed there were well over a thousand of these — navigation stacks, URL-to-destination routing tables, config objects assembled at load time — collectively pulling tens of thousands of eager dependency edges into startup. `inlineRequires` can't touch any of them.

## What falls through the transform

| Category | Why it stays eager |
| --- | --- |
| `react`, `react-native`, jsx runtimes | Metro's `nonInlinedRequires` block list — intentional |
| Side-effect imports (`import './polyfill'`) | No binding to move; emitted as a bare top-level `require()` |
| **Module-init usage** — nav stacks, routers, HOCs, store/saga registration | First use *is* module evaluation → nowhere lazier |
| Default/namespace imports on stock RN | `_interopRequireDefault` wrapper not matched by the plugin |

The module-init category is what hurts most in practice.

## The fix is structural

Make screen references lazy — a thunk that runs on navigation, not at module load:

```js
export const AppStack = createStack([
  { name: 'Home',     getComponent: () => require('./HomeScreen').default },
  { name: 'Settings', getComponent: () => require('./SettingsScreen').default },
]);
```

React Navigation's `getComponent` only invokes the thunk when the screen is first navigated to. That single change — switching from `component: Screen` to `getComponent: () => require('./Screen').default` — moved our startup numbers more than the global flag did.

`React.lazy(() => import('./Screen'))` works too and gives you a `Suspense` fallback while the screen initializes.

The flag and the refactor are complementary. `inlineRequires` handles everything it can automatically. The refactor handles the structural cases it can't.

---

Next: [Expo Router gives you this pattern by default](/posts/2026-06-04-expo-router-screen-level-lazy-loading/) — `getComponent` thunks baked into the routing layer, so you don't have to wire them by hand.

<footer class="post-footnote">
Part of <a href="/posts/2026-06-01-exploring-inlined-requires/">Exploring Inlined Requires to Improve Cold Start</a>.
</footer>
