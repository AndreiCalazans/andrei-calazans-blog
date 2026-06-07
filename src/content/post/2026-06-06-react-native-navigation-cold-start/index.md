---
title: "Where Do React Native Navigation Libraries Spend Their Cold Start?"
description: "A Systrace + Hermes deep dive into four React Native navigation stacks running the exact same app — why Expo Router costs ~3× the cold start and RAM, and what React Navigation adds on top of the leaner react-native-navigation."
publishDate: "2026-06-06"
tags: ["react-native", "performance", "android", "systrace", "navigation"]
draft: true
---

Four navigation stacks, one identical app, profiled on a real device with Perfetto
Systrace and the Hermes sampling profiler. The headline numbers were surprising — so
I went into the traces to find _why_ Expo Router costs ~3× the cold start and RAM, and
what React Navigation adds on top of the leaner react-native-navigation. Then I ran a
[controlled experiment](#4--controlled-experiment--how-much-was-actually-reanimated) that
splits the answer in two: Reanimated/Worklets explains the _RAM_, but barely touches the
_cold start_.

> **Setup:** Expo SDK 56 · RN 0.85 · Hermes · New Architecture (bridgeless/Fabric) ·
> Samsung Galaxy A16 · Android 14 · release / profileable builds.

The full research, traces, and tooling live in the
[StateOfReactNativeNavigation repo](https://github.com/AndreiCalazans/StateOfReactNativeNavigation/tree/main).

Every app renders the **exact same screens** (a 30-row list → push Details → pop, plus a
tab switch) from a shared UI package, so the only variable is the navigation library. Cold
start is the OS `Displayed` metric (process fork → first frame); FPS/CPU/RAM come from
[Flashlight](https://github.com/bamlab/flashlight) driving a
[Maestro](https://maestro.mobile.dev) flow; the breakdowns below come from a Perfetto system
trace (with a `ReactMarker → atrace` forwarder) and a source-mapped Hermes CPU profile per run.

This post is the first of a short series — companions: [the cost of
Expo](/posts/2026-06-07-the-cost-of-expo/) and [the cost of
navigating](/posts/2026-06-07-the-cost-of-navigating/).

## The headline numbers

<div class="cs-legend">
<span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>react-native-navigation (Wix)</span>
<span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation v7</span>
<span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation (Graham Mendick)</span>
<span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span>
</div>

| Library | Cold start (median ms) | Avg FPS | Avg CPU % | Peak RAM (MB) |
| --- | ---: | ---: | ---: | ---: |
| <span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>react-native-navigation</span> | <span class="cs-win">316</span> | 59.8 | 31.2 | <span class="cs-win">195</span> |
| <span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation v7</span> | 358 | 59.9 | 37.8 | 214 |
| <span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span> | 398 | 59.8 | 34.8 | 241 |
| <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span> | <span class="cs-lose">917</span> | 59.8 | 37.1 | <span class="cs-lose">308</span> |

Cold start = median of 3 runs; RAM = Flashlight peak over the navigate flow. All four hold a
steady ~60 FPS on this simple UI — the interesting differences are in **startup cost** and
**memory**.

<div class="cs-chart">
<div class="cs-cap">Cold start — OS <code>Displayed</code> (lower is better)</div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:34%"></div><span class="cs-val">316 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:39%"></div><span class="cs-val">358 ms</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:43%"></div><span class="cs-val">398 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">917 ms</span></div>
</div>

Cold starts, side by side (process launch → Home), clips aligned to the launch with a shared
stopwatch in the middle. Watch when the list appears:

<figure>
<video controls muted playsinline loop preload="metadata">
<source src="/videos/cold-rnn-vs-expo-router.mp4" type="video/mp4" />
</video>
<figcaption>The extremes: <b style="color:#3fb950">react-native-navigation</b> (~316 ms) is on Home and interactive while <b style="color:#f0883e">Expo Router</b> (~917 ms) is still holding its splash — it lands roughly a second later.</figcaption>
</figure>

<figure>
<video controls muted playsinline loop preload="metadata">
<source src="/videos/cold-react-navigation-vs-navigation.mp4" type="video/mp4" />
</video>
<figcaption>The middle of the pack: <b style="color:#58a6ff">React Navigation v7</b> (~358 ms) and the <b style="color:#bc8cff">navigation router</b> (~398 ms) land within a frame or two of each other. (Recorded on the test device; clips loop. Builds are profileable, hence the brief profiler toast.)</figcaption>
</figure>

## 1 · Why does Expo Router add so much cold start and RAM?

Expo Router is ~2.6× the cold start and ~1.6× the peak RAM of the others. The traces point to
**three compounding causes**, none of which is the file-based router's routing logic itself.

### ① It ships a second runtime: Reanimated + Worklets

The Expo Router template pulls in `react-native-reanimated@4` and `react-native-worklets`. None
of the other three apps do. That shows up everywhere:

| Evidence | Expo Router | The other three |
| --- | ---: | ---: |
| Reanimated/Worklets native libs in APK | <span class="cs-lose">8</span> `.so` | 0 |
| arm64 `.so` count (total) | 20 | 11–18 |
| JS CPU blamed to worklets+reanimated | <span class="cs-lose">~106 ms/run</span> | 0 |

The Worklets package spins up a **separate Worklets/Hermes runtime** for the UI thread, and the JS
profile is full of its fingerprints at startup: `[HostFunction] runOnUISync` (~70 ms/run),
`registerCustomSerializable`, `installTurboModule`. That second VM plus its native allocations is, it
turns out, the main driver of the RAM premium — I prove it with a controlled experiment in
[section 4](#4--controlled-experiment--how-much-was-actually-reanimated).

### ② The JS bundle is twice the size, and 2.6× the modules run at startup

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

A 2.8 MB Hermes bytecode file means more to mmap and more to evaluate. The profile shows Expo
Router touches **106 distinct source files** before first frame vs ~36–43 for the others — it is
React Navigation (Expo Router is built on top of it) _plus_ the router layer (route tree
construction, `getRoutes`, `getStateFromPath`, context navigators) _plus_
Reanimated/Worklets/Screens.

### ③ Where the RAM actually goes

Peak RSS from the system trace, split by type. Expo Router's premium is overwhelmingly
**anonymous memory** (JS heaps + native allocations), with smaller bumps in mapped code, GPU and HWUI:

| Library | Peak RSS | anon (heap) | file (code) | GPU | HWUI |
| --- | ---: | ---: | ---: | ---: | ---: |
| <span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>rn-navigation</span> | 182 | 62 | 120 | 52 | 3.9 |
| <span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation</span> | 195 | 70 | 124 | 50 | 2.2 |
| <span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation</span> | 218 | 94 | 124 | 50 | 2.2 |
| <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span> | <span class="cs-lose">326</span> | <span class="cs-lose">176</span> | 152 | 66 | 13.7 |

> **Takeaway for Q1 (refined by the experiment in §4):** the two axes have _different_ causes. The
> **RAM** premium is almost entirely the Reanimated/Worklets runtime. The **cold-start** premium is
> mostly the 2× bigger bundle with 2.6× the modules evaluated at boot, plus the fact that Expo Router
> _is_ React Navigation with a routing layer on top — Reanimated accounts for only ~10% of it
> (~60 ms of ~600 ms).

## 2 · react-native-navigation is the leanest — what does React Navigation v7 add?

rn-navigation wins cold start (316 ms) and RAM (195 MB). The split between native- and JS-driven
navigation explains most of it. The cleanest single view is the `RUN_JS_BUNDLE` marker — how long
the JS entry takes to evaluate:

<div class="cs-chart">
<div class="cs-cap"><code>RUN_JS_BUNDLE</code> — top-level bundle evaluation (ms, from Systrace)</div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:21%"></div><span class="cs-val">55 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:63%"></div><span class="cs-val">168 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:78%"></div><span class="cs-val">208 ms</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:100%"></div><span class="cs-val">266 ms</span></div>
</div>

rn-navigation evaluates its entry in **55 ms**: the JS just registers components and calls
`Navigation.setRoot(...)`. The bottom tabs and the stack are built by **native** Kotlin views —
there is almost no JS render tree to construct, so the JS thread does little and the native side
draws the first frame quickly.

React Navigation v7 is **JS-driven** navigation on top of `react-native-screens`. Compared to
rn-navigation it adds, at startup:

- **The Expo module layer.** It's an Expo app, so its native-module calls run through
  `expo-modules-core` — ~115 ms/run of JS gets _labeled_ `@expo`/`expo-modules-core` (mostly
  synchronous `getConstants`), which rn-navigation's bare setup doesn't show. But careful: a follow-up
  control ([The cost of Expo](/posts/2026-06-07-the-cost-of-expo/)) shows the _fixed_ Expo cold-start
  tax is only ~36 ms — that 115 ms is largely the app's own native traffic wearing an Expo name tag,
  not extra Expo work.
- **A real JS navigation tree.** `NavigationContainer` → navigators → screens are React components
  reconciled by Fabric on the JS thread; the profile shows `@react-navigation` work plus React
  reconciliation (`completeRoot`, `createNode`, `appendChild`).
- **Theme color processing.** `color-convert`/`color-string` show up resolving the default theme.

Net effect: ~+50 ms JS CPU, ~+110 ms of RN bring-up (`REACT_BRIDGELESS_LOADING`: 84 ms → 377 ms),
and ~+19 MB RAM (mostly heap from the JS component tree).

> **Takeaway for Q2:** rn-navigation is lean because navigation is native — the JS bundle barely
> runs at boot. React Navigation's extra cost is real React work for the navigation tree plus the
> Expo module-system init it happens to carry. The honest caveat: part of the gap is "bare RN vs
> Expo app", not navigation library alone (see caveats).

_Aside — the_ **navigation router** _is interesting: native tab bar yet the_ slowest _bundle eval
(266 ms) and the biggest_ `CREATE_UI_MANAGER_MODULE_CONSTANTS` _(68 ms vs ~11–22 ms). It eagerly
`requireNativeComponent`s ~two dozen native view managers (TabBar, TabLayout, NavigationBar…) and
reads Material3 constants at import time — heavy module-load work that lands on the JS thread before
first frame._

## 3 · The typical hot functions during cold start

JS-thread self-time from the Hermes profile (averaged over 3 runs). Two patterns repeat across
_all_ libraries, plus a library-specific tail.

### The shared cold-start tax (every library)

| Hot function | What it is |
| --- | --- |
| `[HostFunction] getConstants` | Synchronous native-module constant loading over the JSI boundary — the single biggest leaf on the Expo apps |
| `getConstantsForViewManager` | Per-view-manager config fetch (Fabric registering view types) |
| `completeRoot` / `createNode` / `appendChild` | Fabric committing the first UI tree to the native shadow tree |
| `renderWithHooks` / `beginWork` / `workLoop`… | React reconciliation of the initial render |
| `[GC Young Gen]` / `hades` | Hermes garbage collection under allocation pressure at boot |

### Library-specific signatures

| Library | JS busy (ms/run) | Top CPU is blamed to… |
| --- | ---: | --- |
| <span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>rn-navigation</span> | <span class="cs-win">169</span> | `react-native-navigation` (57) · `getConstantsForViewManager` · `requireNativeComponent` · a little `lodash` |
| <span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation</span> | 219 | `@expo` (82) + `expo-modules-core` (33) · `getConstants` (74) · `@react-navigation` render (28) · `color-convert` |
| <span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation</span> | 327 | `getConstants` (141!) · native view-manager registration · `navigation-react-native` `TabBarItem` |
| <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span> | <span class="cs-lose">461</span> | `@expo` (163) · `react-native-worklets` (95) + `runOnUISync` (70) · `expo-modules-core` (53) · `expo-router` (25) · `reanimated` |

"JS busy" is non-idle JS-thread self-time during the ~9 s capture window; because the app is
interactive in <1 s, this is effectively the startup burst. Reading it: `getConstants` is the bridge
tax (Expo apps pay it heavily, bare RNN barely), and only Expo Router carries a Worklets runtime on top.

## 4 · Controlled experiment — how much was actually Reanimated?

The findings above are correlational: Expo Router differs from the others in many ways at once. To
isolate Reanimated/Worklets I added **only** it to the leanest app (`react-native-navigation`) —
same screens, same navigation, same everything else — and re-measured. (`apps/rnn_reanimated_app`
in the repo.)

<div class="cs-legend">
<span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>rn-navigation (baseline)</span>
<span class="cs-lib"><span class="cs-dot cs-d-exp"></span>rn-navigation + Reanimated (experiment)</span>
<span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span>
</div>

| Metric | RNN baseline | RNN + Reanimated | Δ (Reanimated) | Expo Router |
| --- | ---: | ---: | ---: | ---: |
| Cold start (median ms) | 316 | 378 | <span class="cs-warnc">+62</span> | 917 |
| Peak RAM — Flashlight (MB) | 195 | 320 | <span class="cs-lose">+125</span> | 308 |
| Peak RSS — trace (MB) | 182 | 318 | <span class="cs-lose">+136</span> | 326 |
| of which anon heap (MB) | 62 | 185 | <span class="cs-lose">+123</span> | 176 |
| `RUN_JS_BUNDLE` (ms) | 55 | 128 | <span class="cs-warnc">+73</span> | 208 |

<div class="cs-grid2">
<div class="cs-chart">
<div class="cs-cap">Cold start (ms) — adding Reanimated barely moves it</div>
<div class="cs-row"><span class="cs-name">RNN</span><div class="cs-bar cs-b-rnn" style="width:34%"></div><span class="cs-val">316</span></div>
<div class="cs-row"><span class="cs-name">RNN+Reanimated</span><div class="cs-bar cs-b-exp" style="width:41%"></div><span class="cs-val">378</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">917</span></div>
</div>
<div class="cs-chart">
<div class="cs-cap">Peak RAM (MB) — adding Reanimated reproduces it entirely</div>
<div class="cs-row"><span class="cs-name">RNN</span><div class="cs-bar cs-b-rnn" style="width:61%"></div><span class="cs-val">195</span></div>
<div class="cs-row"><span class="cs-name">RNN+Reanimated</span><div class="cs-bar cs-b-exp" style="width:100%"></div><span class="cs-val">320</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:96%"></div><span class="cs-val">308</span></div>
</div>
</div>

The result splits the original hypothesis cleanly in two:

> **RAM: confirmed.** Bolting Reanimated/Worklets onto the lean app pushed peak RAM from 195 MB to
> **320 MB** — i.e. it lands at/above Expo Router's 308 MB on its own. The jump is almost entirely
> **anonymous heap** (+123 MB), exactly the Worklets/Hermes UI runtime + native allocations. Its
> Hermes profile shows the identical signature to Expo Router's (`react-native-worklets` ~146 ms,
> `runOnUISync` ~104 ms). **Reanimated/Worklets is the cause of the RAM premium.**

> **Cold start: mostly _not_ Reanimated.** The same change added only **+62 ms** of cold start
> (316 → 378 ms) — about 10% of Expo Router's ~600 ms gap. So my first-pass write-up over-credited
> Reanimated for the slow boot. The bulk of Expo Router's cold start is the 2× bundle, the 106
> modules evaluated at boot, and the router-on-top-of-React-Navigation layering — not the animation
> runtime.

_Footnote on CPU: the experiment's average CPU over the navigate flow jumped to ~73% (vs ~31%
baseline), but that's an artifact of the tiny **continuously looping** Reanimated animation I added
to force the runtime to do work — it is not a cost of merely linking Reanimated. At idle the runtime
is cheap; while animating it is busy. RAM and cold start are unaffected by the probe (the runtime
boots either way)._

## Caveats & method honesty

- **RNN is a bare RN app; the other three are Expo apps.** Some of rn-navigation's lead is "no
  `expo-modules-core`" rather than navigation per se. RNN owns the React host, which is incompatible
  with Expo's host factory, so a bare app was the realistic setup.
- **Constant profiling overhead.** Every release build carries the same instrumentation (Hermes
  sampler enabled in `onCreate` + a ReactMarker→atrace forwarder). That inflates absolute numbers a
  little but is identical across apps, so relative comparisons hold.
- **Hermes sampling is coarse** (~400–1000 samples over the window); per-function ms are indicative
  and were averaged over 3 runs. Cold-start medians are over 3 runs.
- **The RNMarker/RSS breakdowns are single representative cold launches** captured with Perfetto
  callstack sampling attached, which adds overhead — so the `Displayed` in those traces is a bit
  higher than the headline medians. The shape, not the absolute, is the point.
- **One device, one UI.** Samsung Galaxy A16 (Android 14), Hermes, New Architecture (bridgeless +
  Fabric), Expo SDK 56 / RN 0.85. A trivial UI — heavier screens would change the FPS story.
- **Expo Router does a lot more for the cost.** It is not just navigation: you also get deep linking,
  lazy loading, split bundling, file-based routing, and web support out of the box. The numbers above
  measure startup cost on a trivial app — they are not a verdict on whether those features are worth
  it for your project.

<footer class="post-footnote">
Generated from <code>perf-results/</code> in the <a href="https://github.com/AndreiCalazans/StateOfReactNativeNavigation/tree/main">research repo</a>: source-mapped Hermes profiles (<code>*-hermes.json</code>), Perfetto traces (<code>_native/*.perfetto-trace</code>, open at <a href="https://ui.perfetto.dev">ui.perfetto.dev</a>), and Flashlight measures (<code>*.json</code>). Reproduce with <code>scripts/measure.sh</code> and regenerate the table with <code>scripts/compare.py</code>. Companions: <a href="/posts/2026-06-07-the-cost-of-expo/">cost of Expo</a> · <a href="/posts/2026-06-07-the-cost-of-navigating/">cost of navigating</a>.
</footer>
