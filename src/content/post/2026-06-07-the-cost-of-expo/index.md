---
title: "The Cost of Expo & expo-modules-core"
description: "A companion control to the cold-start deep dive: two bare React Native apps next to Expo apps, measuring the actual price of adopting Expo — the fixed core tax, and the marginal cost of each extra Expo module you bolt on."
publishDate: "2026-06-07"
tags: ["react-native", "expo", "performance", "android", "bundling"]
draft: true
---

A companion to the [cold-start deep dive](/posts/2026-06-06-react-native-navigation-cold-start/).
This repo happens to contain a perfect control: two **bare React Native** apps (no Expo at all) next
to three **Expo** apps. So I measured the actual price of adopting Expo — and then the marginal price
of every extra Expo module you bolt on.

> **Setup:** Expo SDK 56 · RN 0.85 · Hermes · New Architecture · Samsung Galaxy A16 · Android 14 ·
> vanilla release builds (no profiling instrumentation).

To keep it fair I built two minimal apps that render the **identical** Home screen (from the shared
UI package) and nothing else — no navigation, no instrumentation:

- <span class="cs-lib"><span class="cs-dot cs-d-bare"></span>`bare-min`</span> — a bare RN 0.85 app, _zero_ Expo packages.
- <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>`expo-min`</span> — an Expo SDK 56 blank app.

Metrics are deliberately instrumentation-free so they're comparable across bare and Expo builds: the
OS `Displayed` time (cold start) and `dumpsys meminfo` TOTAL PSS once the app is on Home. Median of 5
runs after a warm-up. (`experiments/` in the repo.)

## 1 · What every Expo app ships, whether you ask for it or not

Even `expo-min` — a blank app whose only Expo dependency is `expo` itself — autolinks **10 native
modules**. I confirmed these exact 10 appear in _all three_ real Expo apps in the comparison (React
Navigation, the navigation router, and Expo Router); the heavier apps just add more on top.

<div class="cs-panel">
The Expo baseline — present in <strong>every</strong> Expo app:<br/><br/>
<code>expo</code> · <code>expo-modules-core</code> · <code>expo-asset</code> · <code>expo-constants</code> · <code>expo-file-system</code> · <code>expo-font</code> · <code>expo-keep-awake</code> · <code>expo-status-bar</code> · <code>@expo/dom-webview</code> · <code>@expo/log-box</code>
</div>

| App | Expo deps you declared | Native Expo modules autolinked |
| --- | ---: | ---: |
| `expo-min` (blank) | 1 | 10 |
| React Navigation | 2 | 10 |
| navigation router | 2 | 10 |
| Expo Router | 9 | 15 |
| bare RN apps | 0 | 0 |

`expo-modules-core` is the runtime that registers and bridges all of these; it is the thing you're
really "paying for" when you adopt Expo. The question is: how much?

## 2 · The Expo core tax (bare-min → expo-min)

Same screen, same RN, the only difference is Expo. Adopting it costs:

| Metric | bare-min (no Expo) | expo-min (Expo core) | Expo tax |
| --- | ---: | ---: | ---: |
| Cold start — `Displayed` (ms) | 293 | 329 | <span class="cs-warnc">+36</span> |
| RAM — PSS at Home (MB) | 67.0 | 79.6 | <span class="cs-warnc">+12.6</span> |
| APK size (MB) | 49.5 | 65.7 | <span class="cs-warnc">+16.2</span> |

<div class="cs-grid2">
<div class="cs-chart">
<div class="cs-cap">Cold start (ms)</div>
<div class="cs-row"><span class="cs-name">bare-min</span><div class="cs-bar cs-b-bare" style="width:81%"></div><span class="cs-val">293</span></div>
<div class="cs-row"><span class="cs-name">expo-min</span><div class="cs-bar cs-b-expo" style="width:91%"></div><span class="cs-val">329</span></div>
</div>
<div class="cs-chart">
<div class="cs-cap">RAM — PSS at Home (MB)</div>
<div class="cs-row"><span class="cs-name">bare-min</span><div class="cs-bar cs-b-bare" style="width:74%"></div><span class="cs-val">67.0</span></div>
<div class="cs-row"><span class="cs-name">expo-min</span><div class="cs-bar cs-b-expo" style="width:88%"></div><span class="cs-val">79.6</span></div>
</div>
</div>

> **The fixed Expo tax is small:** ~**36 ms** of cold start, ~**13 MB** of RAM, ~**16 MB** of APK.
> That buys `expo-modules-core` plus the 10 baseline modules. For most apps that is a very reasonable
> price — Expo is _not_ where the cold-start budget goes (the
> [navigation/Reanimated analysis](/posts/2026-06-06-react-native-navigation-cold-start/) dwarfs this).

## 3 · The cost of each extra Expo module you add

Starting from `expo-min` I added one module at a time, rebuilt, and re-measured —
**present-but-unused** (just installed + autolinked + initialized, not actually rendered or called).
This is the "I added it to my `package.json`" cost.

| Added module | Δ cold start (ms) | Δ RAM PSS (MB) | Class |
| --- | ---: | ---: | --- |
| `expo-device` | +3 | ~0 | constants only |
| `expo-haptics` | +3 | ~0 | methods only |
| `expo-clipboard` | 0 | +0.2 | methods only |
| `expo-linear-gradient` | ~0 | +0.2 | native view |
| `expo-image` | ~0 | +1.7 | native view + Glide |
| `expo-blur` | +12 | +0.5 | native view |
| `expo-notifications` | +11 | +2.7 | +1 transitive module |
| `expo-video` | +16 | <span class="cs-lose">+5.9</span> | media3 SDK |
| `expo-camera` | +25 | <span class="cs-lose">+5.1</span> | CameraX SDK |

<div class="cs-chart">
<div class="cs-cap">Marginal RAM cost of adding a module (PSS, MB) — the cleanest signal</div>
<div class="cs-row"><span class="cs-name">expo-device</span><div class="cs-bar cs-b-mod" style="width:1%"></div><span class="cs-val">~0</span></div>
<div class="cs-row"><span class="cs-name">expo-haptics</span><div class="cs-bar cs-b-mod" style="width:1%"></div><span class="cs-val">~0</span></div>
<div class="cs-row"><span class="cs-name">expo-clipboard</span><div class="cs-bar cs-b-mod" style="width:3%"></div><span class="cs-val">0.2</span></div>
<div class="cs-row"><span class="cs-name">linear-gradient</span><div class="cs-bar cs-b-mod" style="width:3%"></div><span class="cs-val">0.2</span></div>
<div class="cs-row"><span class="cs-name">expo-blur</span><div class="cs-bar cs-b-mod" style="width:8%"></div><span class="cs-val">0.5</span></div>
<div class="cs-row"><span class="cs-name">expo-image</span><div class="cs-bar cs-b-mod" style="width:29%"></div><span class="cs-val">1.7</span></div>
<div class="cs-row"><span class="cs-name">expo-notifications</span><div class="cs-bar cs-b-mod" style="width:46%"></div><span class="cs-val">2.7</span></div>
<div class="cs-row"><span class="cs-name">expo-camera</span><div class="cs-bar cs-b-mod" style="width:86%"></div><span class="cs-val">5.1</span></div>
<div class="cs-row"><span class="cs-name">expo-video</span><div class="cs-bar cs-b-mod" style="width:100%"></div><span class="cs-val">5.9</span></div>
</div>

> **Adding an Expo module is cheap until you use it.** Pure-JS/"methods & constants" modules (device,
> haptics, clipboard) are essentially free at startup. Even native-view modules (image, blur,
> gradient) add ~0–2 MB and no measurable cold start. Only heavy native SDKs that link a big
> library — `expo-camera` (CameraX), `expo-video` (media3) — show up, and even then it's ~15–25 ms
> and ~5–6 MB _while unused_. expo-modules-core initializes modules lazily, so the registry itself is
> cheap.

Caveat: the cold-start deltas for the light modules are inside run-to-run noise (±~15 ms on this
device), so treat "+3" / "+12" as "≈ 0". The PSS deltas are the reliable signal. And this is the
_idle_ cost — actually decoding an image, opening the camera, or playing video adds real CPU/RAM on
top, on demand.

## 4 · "But the profiler blamed 100–240 ms on `@expo`!"

The [instrumented deep-dive](/posts/2026-06-06-react-native-navigation-cold-start/) attributed a lot
of JS-thread CPU to `@expo` / `expo-modules-core` at cold start:

| App | JS CPU blamed to @expo + expo-modules-core |
| --- | ---: |
| React Navigation | ~118 ms |
| navigation router | ~185 ms |
| Expo Router | ~241 ms |

…but Expo's actual share of `Displayed` is a fixed <span class="cs-win">~36 ms</span> (bare→expo,
measured) regardless of app.

These two facts are not in conflict. In an Expo app, **every** native-module call is routed through
`expo-modules-core`'s module registry, so the profiler labels the app's own native access (UIManager,
view-manager `getConstants`, device info, …) as `@expo`. That number therefore **scales with how much
the app drives native modules** (118 → 185 → 241 ms tracks each app's total JS work), not with a fixed
Expo overhead. The same calls in a bare RN app are simply relabeled `react-native`/`Native`.

The apples-to-apples control — identical screen, bare vs Expo — isolates the part that is truly
_extra_: the registry/proxy indirection, and it costs ~36 ms. So:

> **Bottom line.** The price of Expo itself is a roughly _fixed_ ~36 ms / ~13 MB / ~16 MB APK, plus a
> small, mostly-lazy per-module cost that only becomes significant for heavy native SDKs or when you
> actually _use_ the module. The large `@expo` numbers in a CPU profile are mostly your app's own
> native traffic wearing an Expo name tag.

## Caveats

- **Metrics chosen for fairness, not for matching the other post.** These are vanilla release builds
  measured with `Displayed` + `dumpsys` PSS at Home (no Hermes sampler, no Perfetto). Absolute numbers
  differ from the instrumented post (which measured peak RAM during a navigate flow, ~3× higher) —
  compare deltas within this page, not across pages.
- **Per-module = present but unused.** Each module was installed + autolinked, not exercised. Real
  usage (render/call) adds on-demand cost not captured here.
- **Cold-start noise.** ±~15 ms run-to-run on this device; light-module cold deltas are within it. PSS
  is the more reliable per-module signal.
- **One device / one screen.** Samsung Galaxy A16, Android 14, Hermes, New Architecture, Expo SDK 56 /
  RN 0.85. APK size is universal "arm64 + others" release output.

<footer class="post-footnote">
Data: <code>perf-results/expo-cost/</code> (<code>expo-cost.json</code>, <code>sweep.jsonl</code>); apps in <code>experiments/bare_min</code>, <code>experiments/expo_min</code>. Reproduce a variant with <code>perf-tooling/scripts/quick-coldstart.sh --app &lt;pkg&gt;</code>. Common-module set verified with <code>expo-modules-autolinking resolve -p android</code>. Companions: <a href="/posts/2026-06-06-react-native-navigation-cold-start/">cold start</a> · <a href="/posts/2026-06-07-the-cost-of-navigating/">cost of navigating</a>.
</footer>
