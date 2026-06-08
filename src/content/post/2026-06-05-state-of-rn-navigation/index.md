---
title: "React Native Navigation Benchmarks"
description: "Four navigation libraries, one identical app, benchmarked on Android with Perfetto Systrace and the Hermes CPU profiler. Cold start, RAM, press-to-paint — and what's actually behind the numbers."
publishDate: "2026-06-05"
tags: ["react-native", "performance", "android", "navigation", "systrace"]
draft: true
---

I'm trying to figure out how to build the fastest possible React Native app. A big piece of that is understanding what navigation costs — it runs at startup, it runs on every screen transition, and most teams pick a library without knowing the real numbers.

So I built the same app four times — one for each major navigation library — and measured everything: cold start, RAM, FPS, and what the JS thread actually does. This is what I found.

**Why Android?** Android is where React Native performance bottlenecks most often show up in production, and it gives the richest profiling data. Perfetto Systrace captures every thread boundary — UI thread, JS thread, RenderThread, SurfaceFlinger — at microsecond resolution. The Hermes CPU sampler gives a source-mapped JS call stack for the full startup burst. Together they make it possible to answer *why*, not just *how slow*. iOS has equivalent tools but the data is less granular. Everything here is Android-only.

> **Setup:** Expo SDK 56 · RN 0.85 · Hermes · New Architecture (bridgeless/Fabric) · Samsung Galaxy A16 · Android 14 · release/profileable builds. Cold start = OS `Displayed` metric; FPS/CPU/RAM from [Flashlight](https://github.com/bamlab/flashlight) driving [Maestro](https://maestro.mobile.dev); breakdowns from Perfetto Systrace + source-mapped Hermes CPU profiles. All data and tooling at the [StateOfReactNativeNavigation repo](https://github.com/AndreiCalazans/StateOfReactNativeNavigation).

Every app renders identical screens from a shared UI package — a 30-row list, a push to a Details screen, a tab switch. The only variable is the navigation library.

## The headline numbers

<div class="cs-legend">
<span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>react-native-navigation (Wix)</span>
<span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation v7</span>
<span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation (Graham Mendick)</span>
<span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span>
</div>

| Library | Cold start (ms) | Avg FPS | Avg CPU % | Peak RAM (MB) |
| --- | ---: | ---: | ---: | ---: |
| <span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>react-native-navigation</span> | <span class="cs-win">316</span> | 59.8 | 31.2 | <span class="cs-win">195</span> |
| <span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation v7</span> | 358 | 59.9 | 37.8 | 214 |
| <span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span> | 398 | 59.8 | 34.8 | 241 |
| <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span> | <span class="cs-lose">917</span> | 59.8 | 37.1 | <span class="cs-lose">308</span> |

Cold start = median of 3 runs; RAM = Flashlight peak over the navigate flow. All four hold ~60 FPS — the differences are in **startup cost** and **memory**.

<div class="cs-chart">
<div class="cs-cap">Cold start — OS <code>Displayed</code> (lower is better)</div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:34%"></div><span class="cs-val">316 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:39%"></div><span class="cs-val">358 ms</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:43%"></div><span class="cs-val">398 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">917 ms</span></div>
</div>

<figure>
<video controls muted playsinline loop preload="metadata">
<source src="/videos/cold-rnn-vs-expo-router.mp4" type="video/mp4" />
</video>
<figcaption>The extremes: <b style="color:#3fb950">react-native-navigation</b> (~316 ms) is on Home and interactive while <b style="color:#f0883e">Expo Router</b> (~917 ms) is still holding its splash — landing roughly a second later.</figcaption>
</figure>

<figure>
<video controls muted playsinline loop preload="metadata">
<source src="/videos/cold-react-navigation-vs-navigation.mp4" type="video/mp4" />
</video>
<figcaption>The middle: <b style="color:#58a6ff">React Navigation v7</b> (~358 ms) and the <b style="color:#bc8cff">navigation router</b> (~398 ms) land within a frame or two of each other.</figcaption>
</figure>

## Three things that surprised me

**Expo Router is ~3× the cold start — but Reanimated isn't the main reason.** The Expo Router template ships `react-native-reanimated@4` and `react-native-worklets`, which none of the others do. But a controlled experiment showed Reanimated adds only ~62 ms to cold start. The bulk of the gap is the 2× bigger bundle and the router-on-top-of-React-Navigation layering that evaluates 106 JS modules at boot vs 36–43 for the others.

**Reanimated *is* the RAM story.** Adding only Reanimated to the leanest app (rn-navigation) reproduced Expo Router's entire RAM premium: +125 MB, almost entirely anonymous heap from the second Hermes runtime Worklets spins up.

**rn-navigation wins because navigation is native.** Its JS bundle evaluates in 55 ms. The tabs and stack are Kotlin views — the JS thread barely runs at startup. React Navigation's JS bundle takes 168 ms because it builds a real component tree reconciled by Fabric.

## The series

- [Deep Diving Where Time Is Spent](/posts/2026-06-06-react-native-navigation-cold-start/) — why Expo Router is slow, what React Navigation adds on top of rn-navigation, the Hermes hot functions for each library, and the Reanimated controlled experiment.
- [What's the Expo Tax?](/posts/2026-06-07-the-cost-of-expo/) — the fixed cost of adopting Expo (~36 ms, ~13 MB RAM, ~16 MB APK) and the marginal cost of each extra Expo module.
- [What Does Navigating to a Screen Cost?](/posts/2026-06-07-the-cost-of-navigating/) — press→paint on a trivial screen and a heavy screen, JS call stacks per library, and why "first frame" means very different things when the screen actually has work to do.

## Caveats

- **rn-navigation is a bare RN app; the other three are Expo apps.** Some of its lead is "no expo-modules-core", not just the navigation library. RNN owns the React host, which is incompatible with Expo's host factory.
- **One device, one simple UI.** Samsung Galaxy A16, Android 14, Hermes, New Architecture. Heavier screens change the FPS and navigation cost story.
- **Numbers are indicative.** Hermes sampling is coarse; cold-start medians are 3 runs with constant profiling instrumentation (inflates absolute times identically across all apps).
- **Expo Router does more for the cost.** Deep linking, lazy screen loading, file-based routing, web support. These numbers measure startup on a trivial app — not a verdict on whether the features are worth it.

<div class="cs-panel" style="margin-top:2rem;margin-bottom:0;text-align:right">
  <p style="margin:0 0 0.4rem;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:hsl(var(--theme-text)/0.4)">React Native Navigation Benchmarks</p>
  <a href="/posts/2026-06-06-react-native-navigation-cold-start/" style="font-size:0.875rem">Deep Diving Where Time Is Spent →</a>
</div>

<footer class="post-footnote">
All data in <code>perf-results/</code> at the <a href="https://github.com/AndreiCalazans/StateOfReactNativeNavigation">StateOfReactNativeNavigation repo</a>: Hermes profiles (<code>*-hermes.json</code>), Perfetto traces (open at <a href="https://ui.perfetto.dev">ui.perfetto.dev</a>), Flashlight measures. Reproduce with <code>scripts/measure.sh</code>.
</footer>
