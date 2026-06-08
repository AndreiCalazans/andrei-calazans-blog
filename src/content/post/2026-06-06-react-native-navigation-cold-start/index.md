---
title: "React Native Navigation Benchmarks: Deep Diving Where Time Is Spent"
description: "Why Expo Router costs 3× cold start and RAM, what React Navigation adds on top of rn-navigation, the Hermes hot-function breakdown for each library, and a controlled experiment isolating Reanimated."
publishDate: "2026-06-06"
tags: ["react-native", "performance", "android", "systrace", "navigation"]
draft: true
---

Part of [the series](/posts/2026-06-05-state-of-rn-navigation/). The [intro](/posts/2026-06-05-state-of-rn-navigation/) has the headline numbers — here I go into the traces to explain them.

## 1 · Why Expo Router costs 3× cold start and RAM

Expo Router is ~2.6× the cold start and ~1.6× the peak RAM of the others. Three compounding causes.

### Reanimated/Worklets spins up a second JS runtime

The Expo Router template ships `react-native-reanimated@4` and `react-native-worklets`. None of the other three apps include these.

| Evidence | Expo Router | Other three |
| --- | ---: | ---: |
| Reanimated/Worklets native libs in APK | <span class="cs-lose">8</span> `.so` | 0 |
| Total arm64 `.so` count | 20 | 11–18 |
| JS CPU blamed to worklets + reanimated | <span class="cs-lose">~106 ms/run</span> | 0 |

The Worklets package boots a separate Hermes instance for the UI thread. The profile shows `[HostFunction] runOnUISync` (~70 ms/run), `registerCustomSerializable`, `installTurboModule`. This is the main RAM driver — [proved below](#4--controlled-experiment).

### The bundle is 2× bigger and 2.6× more modules run at startup

<div class="cs-grid2">
<div class="cs-chart">
<div class="cs-cap">Hermes bytecode bundle (KB)</div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:47%"></div><span class="cs-val">1339</span></div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:48%"></div><span class="cs-val">1371</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:55%"></div><span class="cs-val">1574</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">2877</span></div>
</div>
<div class="cs-chart">
<div class="cs-cap">Distinct JS files executed during cold start</div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:34%"></div><span class="cs-val">36</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:36%"></div><span class="cs-val">38</span></div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:41%"></div><span class="cs-val">43</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">106</span></div>
</div>
</div>

A 2.8 MB bytecode file means more to mmap and evaluate. Expo Router touches 106 source files before the first frame vs 36–43 for the others: React Navigation + the router layer (`getRoutes`, `getStateFromPath`, context navigators) + Reanimated/Worklets/Screens.

### RAM breakdown by type

| Library | Peak RSS | anon heap | file (code) | GPU | HWUI |
| --- | ---: | ---: | ---: | ---: | ---: |
| <span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>rn-navigation</span> | 182 | 62 | 120 | 52 | 3.9 |
| <span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation</span> | 195 | 70 | 124 | 50 | 2.2 |
| <span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation</span> | 218 | 94 | 124 | 50 | 2.2 |
| <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span> | <span class="cs-lose">326</span> | <span class="cs-lose">176</span> | 152 | 66 | 13.7 |

Expo Router's premium is overwhelmingly **anonymous heap** — JS heaps + the native Worklets allocations.

> The two axes have different causes. **RAM** = Reanimated/Worklets. **Cold start** = mostly the 2× bundle + 106 modules at boot; Reanimated accounts for only ~10% (~60 ms).

## 2 · Why rn-navigation is the leanest

The cleanest single signal: `RUN_JS_BUNDLE` — how long the JS entry takes to evaluate.

<div class="cs-chart">
<div class="cs-cap"><code>RUN_JS_BUNDLE</code> — top-level bundle evaluation (ms, from Systrace)</div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:21%"></div><span class="cs-val">55 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:63%"></div><span class="cs-val">168 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:78%"></div><span class="cs-val">208 ms</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:100%"></div><span class="cs-val">266 ms</span></div>
</div>

rn-navigation evaluates its entry in **55 ms**: the JS just registers components and calls `Navigation.setRoot()`. Tabs and stacks are native Kotlin views — there's no JS navigation tree to construct, so the first frame arrives fast.

React Navigation is **JS-driven** on top of `react-native-screens`. At startup it adds:

- **A real JS navigation tree.** `NavigationContainer` → navigators → screens are React components reconciled by Fabric (`completeRoot`, `createNode`, `appendChild`).
- **Expo module init.** ~115 ms of JS is labeled `@expo`/`expo-modules-core` by the profiler. But the [Expo Tax post](/posts/2026-06-07-the-cost-of-expo/) shows the fixed Expo overhead is only ~36 ms — the rest is the app's own native-module traffic wearing an Expo name tag.
- **Theme color processing.** `color-convert`/`color-string` run resolving the default theme.

The **navigation router** is interesting in the other direction: it has a native tab bar but the *slowest* bundle eval (266 ms) and the biggest `CREATE_UI_MANAGER_MODULE_CONSTANTS` (68 ms vs 11–22 ms). It eagerly `requireNativeComponent`s ~two dozen view managers and reads Material3 constants at import time — heavy JS work before the first frame.

## 3 · Hot functions at startup (Hermes profile)

JS-thread self-time, averaged over 3 runs.

**The shared cold-start tax across all four libraries:**

| Function | What it is |
| --- | --- |
| `[HostFunction] getConstants` | Synchronous native-module constant loading over JSI — the biggest leaf on Expo apps |
| `getConstantsForViewManager` | Per-view-manager config fetch (Fabric registering view types) |
| `completeRoot` / `createNode` / `appendChild` | Fabric committing the first UI tree to the native shadow tree |
| `renderWithHooks` / `beginWork` | React reconciling the initial render |
| `[GC Young Gen]` / `hades` | Hermes GC under allocation pressure at boot |

**Library-specific signatures:**

<div class="cs-legend">
<span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>react-native-navigation</span>
<span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation v7</span>
<span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span>
<span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span>
</div>

| Library | JS busy (ms) | Where time goes |
| --- | ---: | --- |
| <span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>rn-navigation</span> | <span class="cs-win">169</span> | `react-native-navigation` (57) · `getConstantsForViewManager` · `requireNativeComponent` |
| <span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation</span> | 219 | `@expo` (82) + `expo-modules-core` (33) · `getConstants` (74) · `@react-navigation` render (28) · `color-convert` |
| <span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span> | 327 | `getConstants` (141!) · view-manager registration · `TabBarItem` |
| <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span> | <span class="cs-lose">461</span> | `@expo` (163) · `react-native-worklets` (95) + `runOnUISync` (70) · `expo-modules-core` (53) · `expo-router` (25) |

## 4 · Controlled experiment

The findings above are correlational — Expo Router differs from the others in many ways at once. To isolate Reanimated/Worklets I added **only it** to rn-navigation (same screens, same navigation, nothing else) and re-measured. (`apps/rnn_reanimated_app` in the repo.)

<div class="cs-legend">
<span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>rn-navigation (baseline)</span>
<span class="cs-lib"><span class="cs-dot cs-d-exp"></span>rn-navigation + Reanimated</span>
<span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span>
</div>

| Metric | RNN | RNN + Reanimated | Δ | Expo Router |
| --- | ---: | ---: | ---: | ---: |
| Cold start (ms) | 316 | 378 | <span class="cs-warnc">+62</span> | 917 |
| Peak RAM — Flashlight (MB) | 195 | 320 | <span class="cs-lose">+125</span> | 308 |
| Peak RSS — trace (MB) | 182 | 318 | <span class="cs-lose">+136</span> | 326 |
| of which anon heap (MB) | 62 | 185 | <span class="cs-lose">+123</span> | 176 |
| `RUN_JS_BUNDLE` (ms) | 55 | 128 | <span class="cs-warnc">+73</span> | 208 |

<div class="cs-grid2">
<div class="cs-chart">
<div class="cs-cap">Cold start (ms) — Reanimated adds ~62 ms, not ~600</div>
<div class="cs-row"><span class="cs-name">RNN</span><div class="cs-bar cs-b-rnn" style="width:34%"></div><span class="cs-val">316</span></div>
<div class="cs-row"><span class="cs-name">RNN + Reanimated</span><div class="cs-bar cs-b-exp" style="width:41%"></div><span class="cs-val">378</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">917</span></div>
</div>
<div class="cs-chart">
<div class="cs-cap">Peak RAM (MB) — Reanimated reproduces Expo Router's premium entirely</div>
<div class="cs-row"><span class="cs-name">RNN</span><div class="cs-bar cs-b-rnn" style="width:61%"></div><span class="cs-val">195</span></div>
<div class="cs-row"><span class="cs-name">RNN + Reanimated</span><div class="cs-bar cs-b-exp" style="width:100%"></div><span class="cs-val">320</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:96%"></div><span class="cs-val">308</span></div>
</div>
</div>

**RAM: confirmed.** Reanimated alone pushed peak RAM from 195 → 320 MB — matching Expo Router's 308 MB. The jump is entirely anonymous heap (+123 MB), exactly the Worklets/Hermes UI runtime.

**Cold start: mostly not Reanimated.** The same change added only +62 ms — about 10% of Expo Router's ~600 ms gap. The bulk is the 2× bundle and 106 modules at boot.

<div class="cs-panel" style="margin-top:2rem;margin-bottom:0">
  <p style="margin:0 0 0.65rem;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:hsl(var(--theme-text)/0.4)">React Native Navigation Benchmarks</p>
  <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:0.5rem">
    <a href="/posts/2026-06-05-state-of-rn-navigation/" style="font-size:0.875rem">← Series intro</a>
    <a href="/posts/2026-06-05-state-of-rn-navigation/" style="font-size:0.78rem;color:hsl(var(--theme-text)/0.5);white-space:nowrap">View series</a>
    <a href="/posts/2026-06-07-the-cost-of-expo/" style="font-size:0.875rem;text-align:right;display:block">What’s the Expo Tax? →</a>
  </div>
</div>

<footer class="post-footnote">
Data in <code>perf-results/</code> at the <a href="https://github.com/AndreiCalazans/StateOfReactNativeNavigation">StateOfReactNativeNavigation repo</a>: Hermes profiles (<code>*-hermes.json</code>), Perfetto traces (open at <a href="https://ui.perfetto.dev">ui.perfetto.dev</a>), Flashlight measures. Part of <a href="/posts/2026-06-05-state-of-rn-navigation/">the series</a>.
</footer>
