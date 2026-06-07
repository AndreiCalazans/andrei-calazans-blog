---
title: "The Cost of Navigating: Press → Painted"
description: "Capturing a single real tap inside a Perfetto trace + Hermes profile across four React Native navigation libraries — how long from press to painted, and what call stack actually mounted the screen."
publishDate: "2026-06-07"
tags: ["react-native", "performance", "android", "navigation", "systrace"]
draft: true
---

Part of the e2e flow pushes a Details screen. Here I capture a single real tap inside a Perfetto
trace + Hermes profile and ask two questions per library: **how long from the user's press until the
screen is painted**, and **what call stack mounted the screen**. Companion to the
[cold-start](/posts/2026-06-06-react-native-navigation-cold-start/) and
[Expo-cost](/posts/2026-06-07-the-cost-of-expo/) posts.

> **Setup:** Home → Details push · Samsung Galaxy A16 · Android 14 · Hermes · New Arch · Expo SDK
> 56 / RN 0.85.

The cold-start data had no taps, so I captured fresh traces: cold-launch each app with the Hermes
sampler running, let Home settle, then `input tap` the shared `open-details` button while a Perfetto
system trace records. Two anchors make the measurement objective:

- **Press** = the `startDispatchCycleLocked(…/MainActivity)` input-dispatch slice on `system_server`
  — the moment Android hands the tap to the app.
- **Paint** = the app's presented frames from SurfaceFlinger's actual-frame timeline. The push
  triggers a burst of frames (the transition); its first frame is "content on screen", its last frame
  is "transition settled / fully painted".

JS mount cost + call stacks come from the same run's Hermes profile, isolating the busy burst that
follows the tap.

## 1 · Press → painted

<div class="cs-legend">
<span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>react-native-navigation</span>
<span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation v7</span>
<span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span>
<span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span>
</div>

| Library | Press → first frame | Press → fully painted | Transition frames | Janky frames |
| --- | ---: | ---: | ---: | ---: |
| <span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>react-native-navigation</span> | <span class="cs-win">44 ms</span> | <span class="cs-win">335 ms</span> | 26 | 2 |
| <span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span> | 51 ms | 330 ms | 25 | <span class="cs-lose">15</span> |
| <span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation v7</span> | 62 ms | 522 ms | 43 | 7 |
| <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span> | 61 ms | 520 ms | 43 | 8 |

<div class="cs-grid2">
<div class="cs-chart">
<div class="cs-cap">Press → first frame (responsiveness) — lower better</div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:72%"></div><span class="cs-val">44 ms</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:83%"></div><span class="cs-val">51 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">61 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:100%"></div><span class="cs-val">62 ms</span></div>
</div>
<div class="cs-chart">
<div class="cs-cap">Press → fully painted (transition settled) — lower better</div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:63%"></div><span class="cs-val">330 ms</span></div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:64%"></div><span class="cs-val">335 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">520 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:100%"></div><span class="cs-val">522 ms</span></div>
</div>
</div>

> **Two clusters emerge.** The screen first appears in ~44–62 ms everywhere — all four are "instant"
> to start responding. But _fully painted_ splits in two: ~330 ms (rn-navigation, navigation) vs
> ~520 ms (React Navigation, Expo Router). That gap is the **transition animation length**, a library
> default — and Expo Router is identical to React Navigation because it _is_ React Navigation's
> native-stack underneath (43 frames, same slide). rn-navigation and the navigation router ship a
> snappier ~330 ms native transition (~25 frames).

## 2 · What mounted the screen — JS cost & call stacks

The Details screen itself is trivial (a title + a button), so the JS work to mount it is small — but
the _shape_ of that work is very different per library, which is the interesting part.

<div class="cs-chart">
<div class="cs-cap">JS thread busy time to mount Details (ms) — from the Hermes profile</div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:15%"></div><span class="cs-val">11.8</span></div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:24%"></div><span class="cs-val">19.5</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:60%"></div><span class="cs-val">47.8</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:100%"></div><span class="cs-val">79.8</span></div>
</div>

### <span class="cs-dot cs-d-nav"></span> navigation router — 11.8 ms (leanest)

Pushes a **native** Scene; the JS thread does almost nothing but commit the scene's content to Fabric.

```text
# self-time leaves
11.8ms  [HostFunction] completeRoot      [Native]  — Fabric commit
 ~0ms  commitRoot / flushMutationEffects / commitMutationEffectsOnFiber  [react-native]
```

### <span class="cs-dot cs-d-rnn"></span> react-native-navigation — 19.5 ms

Native container, but the screen content is a React render, plus RNN's native "did appear" events
cross back into JS.

```text
# blame: react-native-navigation 10.1ms · shared-ui 9.4ms
beginWork → renderWithHooks → DetailsScreen  [shared-ui]   — render the screen
triggerOnAllListenersByComponentId            [react-native-navigation]
notifyComponentDidAppear                      [react-native-navigation]
```

### <span class="cs-dot cs-d-expo"></span> Expo Router — 47.8 ms

React commit plus router-context propagation through the tree (the URL/route state updates).

```text
# blame: Native 24.1ms · react-native 16.6ms · expo-router 7.1ms
24.1ms  [HostFunction] completeRoot          [Native]
 8.9ms  propagateParentContextChanges        [react-native] — React Context fan-out
 7.7ms  markUpdateLaneFromFiberToRoot        [react-native]
 7.1ms  latestCallback                       [expo-router]
```

### <span class="cs-dot cs-d-rnav"></span> React Navigation v7 — 79.8 ms (most JS)

Full React reconciliation of the navigator + new screen, the synthetic-event machinery for the press,
and navigation-state updates.

```text
# blame: Native 34.6ms · react-native 28.6ms · @react-navigation 10.9ms · @expo 5.7ms
16.4ms  [HostFunction] completeRoot          [Native]
10.7ms  [HostFunction] appendChild          [Native] — build native view tree
11.9ms  beginEvent / 10.9ms updateCallback   [react-native] — event + render
 6.7ms  destructor / 5.9ms releasePooledEvent [react-native] — synthetic-event pool
        + @react-navigation navigation-state work
```

> **The JS mount cost mirrors how "native" each router is.** The navigation router commits a native
> scene (~12 ms); rn-navigation renders the screen + native appear events (~20 ms); the two React-tree
> routers do real reconciliation — Expo Router ~48 ms (commit + context propagation) and React
> Navigation ~80 ms (commit + view-tree build + event pooling + nav state). Yet none of this is the
> bottleneck for a simple screen.

## 3 · Frames & jank

Number of frames in the transition and how many SurfaceFlinger flagged as janky:

| Library | Transition frames | Janky | Jank rate |
| --- | ---: | ---: | ---: |
| <span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>rn-navigation</span> | 26 | 2 | <span class="cs-win">8%</span> |
| <span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation</span> | 43 | 7 | 16% |
| <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span> | 43 | 8 | 19% |
| <span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span> | 25 | <span class="cs-lose">15</span> | <span class="cs-lose">60%</span> |

The navigation router's native Material transition janked on the majority of its frames on this device
— worth noting even though its total duration is short. (n=1 capture; see caveats.)

## Synthesis

- **For a simple screen, navigation cost is a native-pipeline cost, not a JS cost.** Even React
  Navigation's 80 ms of JS overlaps the input→frame pipeline; first paint is ~44–62 ms for everyone.
- **"Fully painted" is governed by the transition animation** the library ships by default: ~330 ms
  (rn-navigation, navigation router) vs ~520 ms (React Navigation / Expo Router's native-stack slide).
  This is tunable (animation duration / `animation: 'fade'` etc.), not a fixed tax.
- **Expo Router ≈ React Navigation** on every navigation metric — same 43-frame slide, same ballpark
  first frame — because it renders through React Navigation's native-stack.
- **The call stacks tell the architecture:** native-scene routers (navigation, rnn) barely touch JS to
  mount; React-tree routers (React Navigation, Expo Router) pay React reconciliation, context
  propagation, and event-pool churn.

## Caveats

- **n = 1 per library.** One captured tap each; first-frame numbers carry ±~15 ms and the jank counts
  especially are a single sample — treat the navigation router's 60% as "janked badly on this run",
  not a precise rate.
- **Trivial destination screen.** Details is a title + button, so JS mount is a floor; a data-heavy
  screen would grow the JS side and could change the ranking.
- **Transition durations are defaults.** The ~330 vs ~520 ms split reflects each library's
  out-of-the-box animation, which apps routinely change.
- **Hermes sampling is coarse** (~1 ms); sub-millisecond leaves show as 0. The call-stack _shape_ is
  reliable; tiny per-function ms are indicative.
- **One device.** Samsung Galaxy A16, Android 14, Hermes, New Architecture.

<footer class="post-footnote">
Data: <code>perf-results/_nav/</code> (<code>nav-analysis.json</code> + per-app <code>*-nav.perfetto-trace</code> / <code>*-nav-hermes.json</code>). Capture: <code>perf-tooling/scripts/navigate-profile.sh</code>. Analyzers: <code>analyze-navigate.py</code> (press→paint) and <code>analyze-navigate-hermes.py</code> (JS mount). Open traces at <a href="https://ui.perfetto.dev">ui.perfetto.dev</a>. Companions: <a href="/posts/2026-06-07-navigating-to-a-heavy-screen/">busier screen (heavy)</a> · <a href="/posts/2026-06-06-react-native-navigation-cold-start/">cold start</a> · <a href="/posts/2026-06-07-the-cost-of-expo/">cost of Expo</a>.
</footer>
