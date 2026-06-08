---
title: "React Native Navigation Benchmarks: What Does Navigating to a Screen Cost?"
description: "Press → paint measured across four libraries on a trivial screen and a heavy 24-row list. JS call stacks reveal each library's architecture — and why 'first frame' means very different things when the destination actually has work to do."
publishDate: "2026-06-07"
tags: ["react-native", "performance", "android", "navigation", "systrace"]
draft: true
---

Part of [the series](/posts/2026-06-05-state-of-rn-navigation/). Cold start data doesn't include any taps, so I captured fresh traces: cold-launch each app, let Home settle, then `input tap` the shared button while Perfetto Systrace + Hermes record.

**Press** = `startDispatchCycleLocked` on `system_server` (the moment Android hands the tap to the app). **Paint** = first presented frame from SurfaceFlinger.

I ran this twice — once pushing a trivial Details screen (title + button, ~3 host nodes) and once pushing a **24-row FlatList rendered all at once** (~290 nodes). The difference reveals how each library's architecture holds up under real content.

## Trivial screen: press → painted

<div class="cs-legend">
<span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>react-native-navigation</span>
<span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation v7</span>
<span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span>
<span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span>
</div>

| Library | Press → first frame | Press → fully painted | Frames | Janky |
| --- | ---: | ---: | ---: | ---: |
| <span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>rn-navigation</span> | <span class="cs-win">44 ms</span> | <span class="cs-win">335 ms</span> | 26 | 2 |
| <span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span> | 51 ms | 330 ms | 25 | <span class="cs-lose">15</span> |
| <span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation</span> | 62 ms | 522 ms | 43 | 7 |
| <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span> | 61 ms | 520 ms | 43 | 8 |

<div class="cs-grid2">
<div class="cs-chart">
<div class="cs-cap">Press → first frame (ms) — lower is more responsive</div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:72%"></div><span class="cs-val">44 ms</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:83%"></div><span class="cs-val">51 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">61 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:100%"></div><span class="cs-val">62 ms</span></div>
</div>
<div class="cs-chart">
<div class="cs-cap">Press → fully painted (ms) — lower is better</div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:63%"></div><span class="cs-val">330 ms</span></div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:64%"></div><span class="cs-val">335 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">520 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:100%"></div><span class="cs-val">522 ms</span></div>
</div>
</div>

All four feel instant — first content appears in 44–62 ms. The ~190 ms gap in *fully painted* is the transition animation length, not content cost. Expo Router and React Navigation are identical (same 43-frame native-stack slide) because Expo Router renders through React Navigation underneath.

The navigation router's native Material transition ran 15/25 frames janky on this device despite the short total duration.

## What JS is doing during the mount

<div class="cs-chart">
<div class="cs-cap">JS thread busy time to mount Details (ms)</div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:15%"></div><span class="cs-val">11.8</span></div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:24%"></div><span class="cs-val">19.5</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:60%"></div><span class="cs-val">47.8</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:100%"></div><span class="cs-val">79.8</span></div>
</div>

The call stacks tell the architecture directly:

**navigation router — 11.8 ms.** Pushes a native Scene; JS just commits the content.
```text
11.8ms  [HostFunction] completeRoot   — Fabric commit
```

**rn-navigation — 19.5 ms.** Native container, but "did appear" events cross back into JS.
```text
beginWork → renderWithHooks → DetailsScreen        [shared-ui]
triggerOnAllListenersByComponentId                  [react-native-navigation]
```

**Expo Router — 47.8 ms.** Fabric commit + React Context fan-out for URL/route state.
```text
24.1ms  [HostFunction] completeRoot
 8.9ms  propagateParentContextChanges
 7.1ms  latestCallback                              [expo-router]
```

**React Navigation — 79.8 ms.** Full reconciliation: new screen + navigator + synthetic-event churn.
```text
16.4ms  [HostFunction] completeRoot
10.7ms  [HostFunction] appendChild
11.9ms  beginEvent + updateCallback
 6.7ms  destructor + releasePooledEvent             — event pool
```

For a trivial screen none of this is a bottleneck. Even React Navigation's 80 ms of JS overlaps the input-to-frame pipeline — first paint stays under 62 ms for everyone.

## Heavy screen: what changes with real content

| Library | JS mount | Press → first frame | Press → fully painted |
| --- | ---: | ---: | ---: |
| <span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>rn-navigation</span> | 20 → **87 ms** | 44 → **61 ms** ≈ | 335 → **319 ms** ≈ |
| <span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span> | 12 → **124 ms** | 51 → **243 ms** ↑ | 330 → **526 ms** ↑ |
| <span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation</span> | 80 → **114 ms** | 62 → **299 ms** ↑ | 522 → **724 ms** ↑ |
| <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span> | 48 → **134 ms** | 61 → **322 ms** ↑ | 520 → **749 ms** ↑ |

JS mount jumped for everyone — the leaf is the same across all four: `[HostFunction] completeRoot` on a ~290-node tree takes ~50–60 ms vs ~12–24 ms trivial. **This is a Fabric cost, not a router cost.** The navigation router's "lean-JS" advantage from the trivial screen evaporates entirely.

<div class="cs-grid2">
<div class="cs-chart">
<div class="cs-cap">Press → first frame — heavy screen (ms)</div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:19%"></div><span class="cs-val">61 ms</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:76%"></div><span class="cs-val">243 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:93%"></div><span class="cs-val">299 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">322 ms</span></div>
</div>
<div class="cs-chart">
<div class="cs-cap">Press → fully painted — heavy screen (ms)</div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:43%"></div><span class="cs-val">319 ms</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:70%"></div><span class="cs-val">526 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:97%"></div><span class="cs-val">724 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">749 ms</span></div>
</div>
</div>

**rn-navigation barely moved on first frame (61 ms)** while the others jumped to 243–322 ms. That's two different strategies under load:

- **rn-navigation starts the transition immediately**, before content is ready. First frame is fast — but it then drops into a **221 ms "App Deadline Missed"** frame while the 290-node tree commits. The screen appears, then visibly fills in.
- **The others gate the transition on content.** They hold the old screen until the new one renders, so first frame scales with mount cost. Once the animation starts, it's smooth.

<figure>
<video controls muted playsinline loop preload="metadata">
<source src="/videos/rnn-vs-react-navigation-heavy.mp4" type="video/mp4" />
</video>
<figcaption><b style="color:#3fb950">rn-navigation (left)</b> cuts straight to the fully rendered screen while <b style="color:#58a6ff">React Navigation (right)</b> is still mid-slide. Same end result, opposite strategy.</figcaption>
</figure>

On settle time: rn-navigation finishes in ~320 ms (fast but with dropped frames), while the content-gated routers take 526–749 ms (slower to arrive, smoother in motion).

> **The choice is architectural.** rn-navigation optimizes for time-to-first-pixel; the others optimize for a smooth animation. Neither is wrong — they fail differently. The practical fix for heavy screens is the same regardless of router: virtualize the list so the initial commit is a small batch, not 290 nodes at once.

## Caveats

- n = 1 tap per library per screen. First-frame numbers carry ±~15 ms; jank counts are single samples.
- "Heavy" = 24 rows committed synchronously (~290 host nodes). A virtualized list would be much cheaper and would largely eliminate the divergence.
- Transition durations are library defaults — all are configurable.
- Samsung Galaxy A16, Android 14, Hermes, New Architecture.

<div class="cs-panel" style="margin-top:2rem;margin-bottom:0">
  <p style="margin:0 0 0.65rem;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:hsl(var(--theme-text)/0.4)">React Native Navigation Benchmarks</p>
  <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:0.5rem">
    <a href="/posts/2026-06-07-the-cost-of-expo/" style="font-size:0.875rem">← What’s the Expo Tax?</a>
    <a href="/posts/2026-06-05-state-of-rn-navigation/" style="font-size:0.78rem;color:hsl(var(--theme-text)/0.5);white-space:nowrap">View series</a>
    <span style="font-size:0.875rem;text-align:right;display:block;color:hsl(var(--theme-text)/0.3)">You’re at the end</span>
  </div>
</div>

<footer class="post-footnote">
Data: <code>perf-results/_nav/</code> in the <a href="https://github.com/AndreiCalazans/StateOfReactNativeNavigation">StateOfReactNativeNavigation repo</a> — <code>nav-analysis.json</code>, <code>nav-heavy-analysis.json</code>, per-app <code>*-nav.perfetto-trace</code> and <code>*-nav-hermes.json</code>. Part of <a href="/posts/2026-06-05-state-of-rn-navigation/">the series</a>.
</footer>
