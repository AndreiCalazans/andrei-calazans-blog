---
title: "React Native Navigation Benchmarks: What's the Expo Tax?"
description: "A bare RN app vs a blank Expo app — the fixed cost of adopting Expo is ~36 ms and ~13 MB RAM. Then what each extra Expo module adds, and why the Hermes profiler over-attributes 100–240 ms to @expo."
publishDate: "2026-06-07"
tags: ["react-native", "expo", "performance", "android", "bundling"]
draft: true
---

Part of [the series](/posts/2026-06-05-state-of-rn-navigation/). The [deep dive](/posts/2026-06-06-react-native-navigation-cold-start/) showed the Hermes profiler attributing up to 241 ms of JS-thread CPU to `@expo`/`expo-modules-core` at startup. Here I run the actual control to separate the real Expo overhead from the noise.

> **Setup:** two minimal apps rendering the identical Home screen — no navigation, no profiling instrumentation. `bare-min`: bare RN 0.85, zero Expo. `expo-min`: Expo SDK 56 blank app. Cold start = OS `Displayed`; RAM = `dumpsys meminfo` PSS at Home. Median of 5 runs. (`experiments/` in the [repo](https://github.com/AndreiCalazans/StateOfReactNativeNavigation).)

## What every Expo app ships

Even a blank Expo app autolinks **10 native modules** — the same 10 appear in all three Expo apps in the main comparison:

<div class="cs-panel">
<strong>Expo baseline — present in every Expo app:</strong><br/><br/>
<code>expo</code> · <code>expo-modules-core</code> · <code>expo-asset</code> · <code>expo-constants</code> · <code>expo-file-system</code> · <code>expo-font</code> · <code>expo-keep-awake</code> · <code>expo-status-bar</code> · <code>@expo/dom-webview</code> · <code>@expo/log-box</code>
</div>

| App | Expo deps declared | Native Expo modules autolinked |
| --- | ---: | ---: |
| expo-min (blank) | 1 | 10 |
| React Navigation | 2 | 10 |
| navigation router | 2 | 10 |
| Expo Router | 9 | 15 |
| bare RN apps | 0 | 0 |

## The fixed Expo core tax

| Metric | bare-min | expo-min | Expo tax |
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

**~36 ms, ~13 MB RAM, ~16 MB APK.** That's the cost of `expo-modules-core` plus the 10 baseline modules. For most apps that's a reasonable price.

## What each extra module adds

Starting from `expo-min`, I added one module at a time — installed and autolinked, but **not actually used**.

| Added module | Δ cold start | Δ RAM PSS | Class |
| --- | ---: | ---: | --- |
| `expo-device` | +3 ms | ~0 | constants only |
| `expo-haptics` | +3 ms | ~0 | methods only |
| `expo-clipboard` | ~0 | +0.2 MB | methods only |
| `expo-linear-gradient` | ~0 | +0.2 MB | native view |
| `expo-image` | ~0 | +1.7 MB | native view + Glide |
| `expo-blur` | +12 ms | +0.5 MB | native view |
| `expo-notifications` | +11 ms | +2.7 MB | +1 transitive module |
| `expo-video` | +16 ms | <span class="cs-lose">+5.9 MB</span> | media3 SDK |
| `expo-camera` | +25 ms | <span class="cs-lose">+5.1 MB</span> | CameraX SDK |

<div class="cs-chart">
<div class="cs-cap">Marginal RAM cost — idle, not in use (PSS, MB)</div>
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

Simple modules (device, haptics, clipboard) are essentially free at idle. Even native-view modules add only 0–2 MB. Only heavy native SDKs — Camera (CameraX), Video (media3) — show a meaningful cost, and even then it's ~15–25 ms and ~5–6 MB while unused. `expo-modules-core` initializes lazily, so the registry itself is cheap.

> Cold-start deltas for light modules are inside run-to-run noise (±~15 ms on this device). PSS is the more reliable per-module signal.

## Why the profiler blames 100–240 ms on @expo

The [deep dive](/posts/2026-06-06-react-native-navigation-cold-start/) showed the profiler attributing large JS-thread CPU to `@expo`:

| App | JS CPU blamed to @expo + expo-modules-core |
| --- | ---: |
| React Navigation | ~118 ms |
| navigation router | ~185 ms |
| Expo Router | ~241 ms |

These numbers scale with each app's **total native-module traffic**, not with a fixed Expo overhead. In an Expo app every native-module call goes through `expo-modules-core`'s registry, so the profiler labels the app's own UIManager calls, `getConstants` calls, and view-manager fetches as `@expo`. The same calls in a bare RN app show up as `react-native`/`Native`. The part that is truly *extra* — the registry/proxy indirection itself — is the ~36 ms measured above.

<div class="cs-panel" style="margin-top:2rem;margin-bottom:0">
  <p style="margin:0 0 0.65rem;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:hsl(var(--theme-text)/0.4)">React Native Navigation Benchmarks</p>
  <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:0.5rem">
    <a href="/posts/2026-06-06-react-native-navigation-cold-start/" style="font-size:0.875rem">← Deep Diving Where Time Is Spent</a>
    <a href="/posts/2026-06-05-state-of-rn-navigation/" style="font-size:0.78rem;color:hsl(var(--theme-text)/0.5);white-space:nowrap">View series</a>
    <a href="/posts/2026-06-07-the-cost-of-navigating/" style="font-size:0.875rem;text-align:right;display:block">What Does Navigating Cost? →</a>
  </div>
</div>

<footer class="post-footnote">
Data: <code>perf-results/expo-cost/</code> in the <a href="https://github.com/AndreiCalazans/StateOfReactNativeNavigation">StateOfReactNativeNavigation repo</a>. Reproduce with <code>perf-tooling/scripts/quick-coldstart.sh</code>. Module set verified with <code>expo-modules-autolinking resolve -p android</code>. Part of <a href="/posts/2026-06-05-state-of-rn-navigation/">the series</a>.
</footer>
