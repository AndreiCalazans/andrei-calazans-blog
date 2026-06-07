---
title: "A Busier JS Thread: Navigating to a Heavy Screen"
description: "The trivial-screen navigation benchmark, re-run against a 24-row FlatList rendered all at once (~290 nodes). What happens to press → paint when the JS thread actually has work to do — and how each router fails differently under load."
publishDate: "2026-06-07"
tags: ["react-native", "performance", "android", "navigation", "systrace"]
draft: true
---

The [navigation post](/posts/2026-06-07-the-cost-of-navigating/) pushed a trivial Details screen (a
title + a button). Here I replace the destination with a **24-row FlatList rendered all at once**
(~12 host components per row × 24 ≈ 290 nodes) and re-run the exact same measurement. What happens to
press→paint when the JS thread actually has work to do?

> **Setup:** trivial (≈3 nodes) vs heavy (≈290 nodes) · Samsung Galaxy A16 · Android 14 · Hermes ·
> New Arch · Expo SDK 56 / RN 0.85.

Same capture method as before: cold-launch, settle Home, `input tap` a button while a Perfetto trace
+ Hermes profile record. The only change is the button now pushes the heavy screen. Press is anchored
at the input dispatch; paint at SurfaceFlinger's presented frames.

## The whole picture: trivial → heavy

<div class="cs-legend">
<span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>react-native-navigation</span>
<span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation v7</span>
<span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span>
<span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span>
</div>

| Library | JS mount | Press → first frame | Press → fully painted | Janky / frames |
| --- | ---: | ---: | ---: | ---: |
| <span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>rn-navigation</span> | 19.5 → **86.7** ms ↑ | 44 → **61** ms ≈ | 335 → **319** ms ≈ | 2/26 → 4/8 |
| <span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span> | 11.8 → **123.7** ms ↑ | 51 → **243** ms ↑ | 330 → **526** ms ↑ | 15/25 → 3/24 |
| <span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation</span> | 79.8 → **113.6** ms ↑ | 62 → **299** ms ↑ | 522 → **724** ms ↑ | 7/43 → 4/40 |
| <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span> | 47.8 → **134.2** ms ↑ | 61 → **322** ms ↑ | 520 → **749** ms ↑ | 8/43 → 3/39 |

Bold = heavy screen; ↑ = got worse, ≈ = roughly flat. Three different things move in three different
ways — so let's take them one at a time.

## 1 · JS mount cost: the Fabric commit, shared by everyone

<div class="cs-chart">
<div class="cs-cap">JS thread busy time to mount the screen (ms) — heavy screen</div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:65%"></div><span class="cs-val">86.7</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:85%"></div><span class="cs-val">113.6</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:92%"></div><span class="cs-val">123.7</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">134.2</span></div>
</div>

Every library's JS mount cost jumped, and the leaf eating the time is the same one everywhere —
`[HostFunction] completeRoot`, the Fabric commit of the new view tree (~50–60 ms for the ~290-node
tree vs ~12–24 ms trivial):

```text
# navigation router — heavy mount, blamed: react-native 64.8ms · Native 58.9ms
58.9ms  [HostFunction] completeRoot   [Native] — commit the ~290-node tree
```

Node counts here are **counted from the component tree** (24 rows × ~12 host `View`/`Text`
components, plus list/screen chrome) — they are _not_ read off the trace. Neither tool prints a node
count: the Hermes profile is sampled (so `createNode` only appears when a sample lands there), and the
Systrace shows the commit cost and per-view _draw_ slices for the on-screen rows, not the full shadow
tree. What the trace confirms is the _magnitude_ — `completeRoot` scaling ~5×.

> **The navigation router's lean-JS advantage evaporates.** On the trivial screen it mounted in
> 11.8 ms (it commits a native scene). With real content it's 123.7 ms — because the _content_ is
> React/Fabric regardless of which router wraps it. A busier JS thread is mostly a shared
> React-reconcile + Fabric-commit cost; the router's own overhead becomes a shrinking slice.

## 2 · Press → first frame splits the libraries by architecture

<div class="cs-chart">
<div class="cs-cap">Press → first frame on the heavy screen (ms) — lower is more responsive</div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:19%"></div><span class="cs-val">61 ms</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:76%"></div><span class="cs-val">243 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:93%"></div><span class="cs-val">299 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">322 ms</span></div>
</div>

On the trivial screen everyone showed the first frame in ~44–62 ms. With the heavy screen, three of
the four jumped to **~240–320 ms** — but **rn-navigation barely moved (61 ms)**. That's not magic;
it's two different strategies:

- **rn-navigation starts the transition immediately**, presenting the new screen container before its
  content is ready. Its first frame stays fast — but right after it comes a **single 221 ms "App
  Deadline Missed" frame** while the ~290-node tree commits. The screen appears, then visibly stutters
  as it fills in.
- **React Navigation, Expo Router (native-stack) and the navigation router gate the transition on
  content** — they keep the old screen until the new one has rendered, so first-frame scales with
  mount cost (~240–320 ms) but the animation, once it starts, is smooth.

<figure>
<video controls muted playsinline loop preload="metadata">
<source src="/videos/rnn-vs-react-navigation-heavy.mp4" type="video/mp4" />
</video>
<figcaption>Same tap to the heavy screen, clips aligned to the press (shared stopwatch in the middle). <b style="color:#3fb950">react-native-navigation (left)</b> hard-cuts straight to the fully rendered 24-row screen — it <strong>drops the transition frames</strong> (the slide animation never really plays) — while <b style="color:#58a6ff">React Navigation (right)</b> is still mid-slide at the same instant and arrives a few hundred ms later, smoothly. The brief toast on the left is the Hermes-profiler dump from the profiling build. Recorded on the test device; loops.</figcaption>
</figure>

> **"First frame" means different things under load.** For rn-navigation it's "the container is
> animating" (content not yet there); for the others it's "the finished screen is about to slide in".
> Same number on the trivial screen, very different thing on a heavy one.

## 3 · Settled time & the responsiveness ↔ smoothness trade-off

<div class="cs-chart">
<div class="cs-cap">Press → fully painted on the heavy screen (ms)</div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:43%"></div><span class="cs-val">319 ms</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:70%"></div><span class="cs-val">526 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:97%"></div><span class="cs-val">724 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">749 ms</span></div>
</div>

The heavy commit blows frame deadlines for everyone, but the trade-off is visible in _how_:

- **rn-navigation** finishes in about the same wall time as the trivial screen (~320 ms) — but it gets
  there by **dropping frames**: only 8 frames, half of them janky, including that 221 ms stall. Fast
  and rough.
- **The content-gated routers** take ~200 ms longer to settle (526–749 ms) because the heavy render
  happens _before_ the animation — yet their animation frames are mostly on time (e.g. the navigation
  router went from 15/25 janky on the trivial slide to 3/24 here, because the expensive work moved out
  of the animation window). Slower, but smoother.

> **Bottom line:** under a busy JS thread the libraries don't just get "slower" — they make a design
> choice. rn-navigation optimizes for _time-to-first-pixel_ and accepts a stutter while content fills;
> React Navigation / Expo Router / the navigation router optimize for a _smooth transition_ and accept
> a longer wait before anything moves. Neither is wrong; they fail differently. And Expo Router tracks
> React Navigation throughout (same native-stack underneath).

## Takeaways

- **A heavy screen is a shared React/Fabric cost** — `completeRoot` on the new tree dominates
  (~50–60 ms here) for every router; the choice of router barely changes the mount itself.
- **The router controls _when_ you pay it, not how much.** Render-before-present (React Navigation,
  Expo Router, navigation router) hides the cost as a delay; present-then-fill (rn-navigation) shows it
  as jank.
- **The trivial-screen ranking is misleading for real apps.** On a trivial screen the navigation
  router looked cheapest (12 ms JS); with content it's 124 ms — basically tied with the others.
  Benchmark with a representative screen.

## Caveats

- **n = 1 per library per screen.** One captured tap each; first-frame ±~15 ms and the jank counts are
  single samples. The rn-navigation 221 ms stall and the ~240–320 ms gating delay are large and
  architectural, but treat exact numbers as indicative.
- **"Heavy" here = 24 rows committed synchronously** (~290 host nodes, counted from the component tree
  — not measured in the trace). A virtualized list that renders a small initial batch would be cheaper;
  this deliberately stresses the mount.
- **Transition animation durations are library defaults** and configurable.
- **One device.** Samsung Galaxy A16, Android 14, Hermes, New Architecture, Expo SDK 56 / RN 0.85.

<footer class="post-footnote">
Data: <code>perf-results/_nav/nav-heavy-analysis.json</code> + per-app <code>*-heavy-nav.perfetto-trace</code> / <code>*-heavy-nav-hermes.json</code>. Heavy screen + <code>open-heavy</code> button live in <code>shared-ui</code>; capture via <code>navigate-profile.sh --button-id open-heavy</code>. Companions: <a href="/posts/2026-06-07-the-cost-of-navigating/">cost of navigating (trivial)</a> · <a href="/posts/2026-06-06-react-native-navigation-cold-start/">cold start</a> · <a href="/posts/2026-06-07-the-cost-of-expo/">cost of Expo</a>.
</footer>
