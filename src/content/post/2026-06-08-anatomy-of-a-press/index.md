---
title: "Anatomy of a Press: From Touch to Paint"
description: "A press in React Native crosses four threads and three layer boundaries before a new pixel appears on screen. Every hop traced with real Systrace and Hermes CPU-profile data — where you can accidentally block responsiveness and how to instrument it in production."
publishDate: "2026-06-08"
tags: ["react-native", "performance", "android", "systrace", "navigation"]
draft: true
---

<style>
/* ── Thread chips ── */
.pa-chip {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  margin: 1px;
  vertical-align: middle;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.pa-ui     { background: #1a7f37; }
.pa-js     { background: #1f6feb; }
.pa-native { background: #8250df; }
.pa-rt     { background: #bc4c00; }
.pa-sf     { background: #9a6700; }

/* ── Pipeline step boxes ── */
.pa-pipeline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 10px;
  margin: 1.25rem 0;
}
.pa-pstep {
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  padding: 14px 16px;
  text-align: center;
}
.pa-pstep .pa-num {
  font-size: 24px;
  font-weight: 800;
  margin-bottom: 6px;
  line-height: 1;
}
.pa-pstep .pa-desc {
  font-size: 12.5px;
  color: #57606a;
  line-height: 1.55;
  margin-top: 6px;
}
.pa-chip-label {
  display: block;
  margin-bottom: 4px;
}

/* ── Flame-graph wrapper (light mode) ── */
.pa-fg-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 1.25rem 0 0.3rem;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  background: #f6f8fa;
  padding: 12px 12px 8px;
}
.pa-fg-wrap svg { display: block; min-width: 700px; }

/* ── Hermes profile pre-block ── */
.pa-pre {
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  padding: 14px 18px;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: #1f2328;
  line-height: 1.65;
  margin: 0.9rem 0;
  white-space: pre;
}
.pa-pre .hl   { color: #bc4c00; font-weight: 600; }
.pa-pre .dim  { color: #57606a; }
.pa-pre .ok   { color: #1a7f37; }
.pa-pre .wn   { color: #9a6700; }

/* ── Risk cards ── */
.pa-risk {
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  padding: 14px 18px;
  margin: 10px 0;
}
.pa-risk .pa-rtitle {
  font-weight: 700;
  margin-bottom: 4px;
  font-size: 14.5px;
}
.pa-risk .pa-where {
  font-size: 13px;
  color: #0969da;
  margin-bottom: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.pa-risk .pa-why {
  font-size: 13.5px;
  color: #24292f;
  line-height: 1.65;
}
.pa-risk .pa-why code {
  background: #eaeef2;
  border: 1px solid #d0d7de;
  border-radius: 4px;
  padding: 0.1em 0.38em;
  font-size: 0.85em;
}
.pa-risk.bad  { border-left: 4px solid #cf222e; }
.pa-risk.warn { border-left: 4px solid #9a6700; }
.pa-risk.good { border-left: 4px solid #1a7f37; }
.pa-risk.bad  .pa-rtitle { color: #cf222e; }
.pa-risk.warn .pa-rtitle { color: #9a6700; }
.pa-risk.good .pa-rtitle { color: #1a7f37; }

/* ── Thread legend row ── */
.pa-legend {
  font-size: 12.5px;
  color: #57606a;
  margin: 0.5rem 0 1.1rem;
  line-height: 2;
}

/* ── Summary callout (good) ── */
.pa-callout-good {
  border-left: 4px solid #1a7f37;
  background: #dafbe1;
  border-radius: 0 8px 8px 0;
  padding: 12px 18px;
  margin: 1.25rem 0;
  font-size: 14px;
  line-height: 1.65;
  color: #1f2328;
}
.pa-callout-good code {
  background: #c4eacc;
  border: 1px solid #a6d9af;
  border-radius: 4px;
  padding: 0.1em 0.38em;
  font-size: 0.85em;
}

/* ── Inline insight callout ── */
.pa-callout {
  border-left: 4px solid #0969da;
  background: #ddf4ff;
  border-radius: 0 8px 8px 0;
  padding: 12px 18px;
  margin: 1.25rem 0;
  font-size: 14px;
  line-height: 1.65;
  color: #1f2328;
}
.pa-callout code {
  background: #b6e3ff;
  border: 1px solid #80ccff;
  border-radius: 4px;
  padding: 0.1em 0.38em;
  font-size: 0.85em;
}

@media (max-width: 640px) {
  .pa-pipeline { grid-template-columns: 1fr 1fr; }
}
</style>

A press in React Native crosses **four threads** and three layer boundaries before a new pixel
appears on screen. This post traces every hop — with real Systrace and Hermes CPU-profile data — and
answers: _where can you accidentally block responsiveness, and how do you instrument it in
production?_

> **Setup:** New Architecture (Fabric + JSI) · Android · Samsung Galaxy A16. Data from
> `perf-results/_nav/react-navigation-nav.perfetto-trace` + Hermes profile from the
> [StateOfReactNativeNavigation repo](https://github.com/AndreiCalazans/StateOfReactNativeNavigation).

A tap on `open-details` was recorded inside a Perfetto system trace (atrace + scheduler) while a
Hermes sampling profile ran in parallel. Everything is measured from the real device. Companions:
[cold start](/posts/2026-06-06-react-native-navigation-cold-start/) · [cost of navigating](/posts/2026-06-07-the-cost-of-navigating/) · [heavy screen](/posts/2026-06-07-navigating-to-a-heavy-screen/).

## The four threads a press touches

<div class="pa-pipeline">
  <div class="pa-pstep">
    <div class="pa-num" style="color:#1a7f37">①</div>
    <span class="pa-chip-label"><span class="pa-chip pa-ui">UI thread</span></span>
    <div class="pa-desc">Receives the raw MotionEvent, hit-tests the React tree, fires FabricEventEmitter</div>
  </div>
  <div class="pa-pstep">
    <div class="pa-num" style="color:#1f6feb">②</div>
    <span class="pa-chip-label"><span class="pa-chip pa-js">mqt_v_js</span></span>
    <div class="pa-desc">JS onPress handler executes, React reconciles the state update, shadow tree diff runs</div>
  </div>
  <div class="pa-pstep">
    <div class="pa-num" style="color:#8250df">③</div>
    <span class="pa-chip-label"><span class="pa-chip pa-ui">UI thread</span> again</span>
    <div class="pa-desc">MountItemDispatcher applies IntBufferBatch mutations (CREATE / INSERT / UPDATE_*)</div>
  </div>
  <div class="pa-pstep">
    <div class="pa-num" style="color:#bc4c00">④</div>
    <span class="pa-chip-label"><span class="pa-chip pa-rt">RenderThread</span></span>
    <div class="pa-desc">HWUI draws the frame, eglSwapBuffers queues it to SurfaceFlinger → pixel on screen</div>
  </div>
</div>

<p class="pa-legend">Thread legend: <span class="pa-chip pa-ui">UI</span> = main Android UI thread
(<em>com.rnperf.xxx</em> in the trace). <span class="pa-chip pa-js">JS</span> = <em>mqt_v_js</em>,
the JS engine thread. <span class="pa-chip pa-native">native</span> = <em>mqt_v_native</em>
helper. <span class="pa-chip pa-rt">RT</span> = HWUI RenderThread.
<span class="pa-chip pa-sf">SF</span> = SurfaceFlinger (separate process, not shown here).</p>

## The full timeline — measured from Systrace

Every slice below is a real `atrace` / Choreographer name from the React Navigation cold-nav trace.
The timeline starts when the finger touches the screen (`deliverInputEvent` DOWN) and ends after the
third GPU frame of the slide animation. Hover any segment for the exact slice name and duration.

<img src="/images/anatomy-of-a-press-flamegraph.svg" alt="Press-to-paint flamegraph timeline — four thread lanes (UI, JS, RenderThread) with coloured segments from finger-down to eglSwapBuffers" style="width:100%;border:1px solid #d0d7de;border-radius:10px;display:block">

<p style="font-size:0.78rem;color:#6b7280;font-style:italic;margin-top:0.5rem">Scale: 8 px / ms. All slice names are real <code>atrace</code> output from the React Navigation cold-nav trace (press @ 7690 ms into the capture). Raw trace: <a href="https://ui.perfetto.dev">ui.perfetto.dev</a> → <code>perf-results/_nav/react-navigation-nav.perfetto-trace</code>.</p>

## Every hop, named and timed

| Stage | Thread | Slice name in Systrace | Duration | Notes |
| --- | --- | --- | ---: | --- |
| **① Input dispatch** | <span class="pa-chip pa-ui">UI</span> | `deliverInputEvent` | 14 ms | Android routes MotionEvent from `system_server`→app. Includes two binder round-trips for early processing. |
| ① *EarlyPostImeInputStage* | <span class="pa-chip pa-ui">UI</span> | `EarlyPostImeInputStage id=0x…` | 9.4 ms | IME / keyboard pre-processing. Two binder calls to InputManagerService. Large on Samsung One UI. |
| ① *ViewPostImeInputStage* | <span class="pa-chip pa-ui">UI</span> | `ViewPostImeInputStage id=0x…` | 4.3 ms | React's hit-test: `TouchTargetHelper` walks the Fabric shadow tree to find the touched view. |
| ① *Marshal to JS* | <span class="pa-chip pa-ui">UI</span> | `TouchesHelper.sentTouchEventModern(topTouchStart)` | 1 ms | Wraps touch into a `TouchEvent` and enqueues on the JS event queue. Finger-down fires; finger-up fires ~4 ms later. |
| **② JS event handling** | <span class="pa-chip pa-js">JS</span> | `beginEvent`, `updateCallback`, `releasePooledEvent` | 12 ms | JS dequeues `topTouchStart` + `topTouchEnd`, synthesises `onPress`, calls through `Pressable`'s event system. Synthetic-event pool churn visible as `destructor`/`releasePooledEvent`. |
| ② *React reconcile* | <span class="pa-chip pa-js">JS</span> | `workLoopSync`, `beginWork`, `renderWithHooks` | 5–30 ms | React diffs the fiber tree for the state update triggered by onPress. Cost grows linearly with the size of the re-render subtree. |
| ② *Fabric commit (JSI)* | <span class="pa-chip pa-js">JS</span> | `[HostFunction] completeRoot` | 12–60 ms | Synchronous JSI call into C++ Fabric. Transfers the shadow-tree mutation list. Holds JS blocked for its entire duration. The single biggest JS-side risk. |
| ② *appendChild / createNode* | <span class="pa-chip pa-js">JS</span> | `[HostFunction] appendChild`, `createNode` | 1–11 ms | Each new native view costs a JSI call. Trivial screen: ~3 calls; 24-row heavy screen: hundreds. |
| **③ Native mount** | <span class="pa-chip pa-ui">UI</span> | `MountItemDispatcher::mountViews` | 2–4 ms | UI thread applies mutations: CREATE, INSERT, UPDATE_STATE, UPDATE_LAYOUT, UPDATE_EVENTHANDLER. Happens inside the next Choreographer frame. |
| **④ GPU draw** | <span class="pa-chip pa-rt">RT</span> | `DrawFrames`, `eglSwapBuffersWithDamageKHR`, `queueBuffer` | 4–8 ms | HWUI records + submits draw commands. `eglSwapBuffers` = frame queued to SurfaceFlinger = pixel visible. |

## What the Hermes CPU profile shows inside JS

During the press, the JS thread is doing this work (from the source-mapped Hermes profile of the
React Navigation app's navigate-to-Details capture). Self-time = time the function was the actual
leaf executing, not including callees.

<div class="pa-pre"><span class="dim">── JS thread, press-handling burst (~80ms wall, ~80ms JS busy) ──</span>

<span class="hl">16.4ms</span>  [HostFunction] completeRoot          <span class="dim">← Fabric commit: synchronous JSI call into C++</span>
<span class="hl">11.9ms</span>  beginEvent                           <span class="dim">← synthetic event dispatch machinery</span>
<span class="hl">10.9ms</span>  updateCallback                       <span class="dim">← React event handler invocation</span>
<span class="hl">10.7ms</span>  [HostFunction] appendChild           <span class="dim">← per-view JSI call (x calls for new screen)</span>
<span class="wn"> 7.5ms</span>  [Native] functionPrototypeApply      <span class="dim">← JS engine intrinsic (spread/apply calls)</span>
  6.7ms  destructor                           <span class="dim">← synthetic event pool cleanup</span>
  5.9ms  releasePooledEvent                   <span class="dim">← synthetic event pool</span>
  5.7ms  [Native] mapPrototypeGet             <span class="dim">← Map.get (navigation state lookups)</span>
  4.2ms  emit                                 <span class="dim">← EventEmitter dispatch (navigation events)</span>

<span class="dim">Blame by library:</span>
<span class="hl">34.6ms</span>  Native                               <span class="dim">← JSI/C++ calls (completeRoot + appendChild)</span>
<span class="hl">28.6ms</span>  react-native                         <span class="dim">← React reconciler + event system</span>
10.9ms  @react-navigation                    <span class="dim">← navigation state updates</span>
  5.7ms  @expo                                <span class="dim">← expo-modules-core routing</span></div>

<div class="pa-callout">
  <strong>Key insight:</strong> <code>[HostFunction] completeRoot</code> is the dominant JS-side leaf.
  It's a <em>synchronous</em> JSI call from JS into Fabric's C++ layer — JS is fully blocked for its
  entire duration. On a trivial screen it's ~12 ms; on the 24-row heavy screen it grew to ~60 ms.
  Everything inside Fabric (layout via Yoga, shadow tree diff, mutation-list serialization) happens
  inside that call, invisible to the Hermes profiler.
</div>

## How the pipeline differs by navigation library

The press-handling journey is the same for every library up through
`FabricEventEmitter.receiveEvent`. Differences emerge in steps ② and ③:

<div class="cs-legend">
<span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>react-native-navigation</span>
<span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span>
<span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation v7</span>
<span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span>
</div>

| Library | JS mount (step ②) | Native mount latency (step ③) | press → first frame |
| --- | ---: | ---: | ---: |
| <span class="cs-lib"><span class="cs-dot cs-d-rnn"></span>react-native-navigation</span> | ~20 ms (render + RNN events) | ~35 ms after press | <span class="cs-win">44 ms</span> |
| <span class="cs-lib"><span class="cs-dot cs-d-nav"></span>navigation router</span> | ~12 ms (completeRoot only) | ~33 ms after press | 51 ms |
| <span class="cs-lib"><span class="cs-dot cs-d-rnav"></span>React Navigation v7</span> | ~80 ms (full reconcile + event pool) | ~54 ms after press | <span class="cs-lose">62 ms</span> |
| <span class="cs-lib"><span class="cs-dot cs-d-expo"></span>Expo Router</span> | ~48 ms (commit + context propagation) | ~50 ms after press | 61 ms |

<div class="cs-grid2">
<div class="cs-chart">
<div class="cs-cap">JS mount cost per library (ms) — lower is less JS work</div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:15%"></div><span class="cs-val">12 ms</span></div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:25%"></div><span class="cs-val">20 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:60%"></div><span class="cs-val">48 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:100%"></div><span class="cs-val">80 ms</span></div>
</div>
<div class="cs-chart">
<div class="cs-cap">Press → first frame (ms) — lower is more responsive</div>
<div class="cs-row"><span class="cs-name">rn-navigation</span><div class="cs-bar cs-b-rnn" style="width:72%"></div><span class="cs-val">44 ms</span></div>
<div class="cs-row"><span class="cs-name">navigation</span><div class="cs-bar cs-b-nav" style="width:83%"></div><span class="cs-val">51 ms</span></div>
<div class="cs-row"><span class="cs-name">Expo Router</span><div class="cs-bar cs-b-expo" style="width:100%"></div><span class="cs-val">61 ms</span></div>
<div class="cs-row"><span class="cs-name">React Navigation</span><div class="cs-bar cs-b-rnav" style="width:100%"></div><span class="cs-val">62 ms</span></div>
</div>
</div>

## Where you can accidentally block responsiveness

Every stage of the pipeline is an opportunity to add latency. Here are the real ones:

<div class="pa-risk bad">
  <div class="pa-rtitle">🔴 Long synchronous work inside <code>onPress</code></div>
  <div class="pa-where">JS thread, step ②</div>
  <div class="pa-why">Your <code>onPress</code> handler runs <em>synchronously on the JS thread</em>
  before any reconciliation. Expensive computation, large JSON.parse, synchronous storage reads, or
  chained <code>.forEach</code> loops on large arrays here directly delay the commit.
  <strong>Rule:</strong> keep onPress handlers under 5 ms. Move heavy work to
  <code>setTimeout(fn, 0)</code> or a Worker.</div>
</div>

<div class="pa-risk bad">
  <div class="pa-rtitle">🔴 Large re-render subtree from a state update</div>
  <div class="pa-where">JS thread, step ② — workLoopSync / beginWork</div>
  <div class="pa-why">React reconciles the <em>entire subtree</em> rooted at the component whose state
  changed. If your onPress calls <code>setState</code> high in the tree (e.g., a context that wraps
  the whole app), thousands of components may run <code>render</code>. Use
  <code>React.memo</code>, split context, or move state down.</div>
</div>

<div class="pa-risk bad">
  <div class="pa-rtitle">🔴 Heavy destination screen (large Fabric commit)</div>
  <div class="pa-where">JS thread, step ② — [HostFunction] completeRoot</div>
  <div class="pa-why">Measured: trivial screen = ~12 ms completeRoot; 24-row heavy screen = ~60 ms.
  Every node is a synchronous JSI call into C++. Virtualize lists, lazy-render off-screen content,
  and avoid mounting large trees synchronously on navigation. Consider
  <code>startTransition</code> / deferred rendering for expensive screens.</div>
</div>

<div class="pa-risk warn">
  <div class="pa-rtitle">🟡 Animation running while JS is reconciling</div>
  <div class="pa-where">UI thread (Choreographer) + JS thread contention</div>
  <div class="pa-why">If a CSS-style animation or Reanimated worklet needs to run on the JS thread
  while your onPress reconciliation is happening, one of them will skip frames. Use Reanimated's
  worklet thread (<code>useAnimatedStyle</code> with worklet functions) to keep animations
  off the JS thread entirely.</div>
</div>

<div class="pa-risk warn">
  <div class="pa-rtitle">🟡 Synchronous native module calls in onPress</div>
  <div class="pa-where">JS thread, step ② — [HostFunction] getConstants</div>
  <div class="pa-why">Native modules that call <code>getConstants()</code> synchronously (the Expo
  module proxy does this for every module's first access) block the JS thread. Cache constants
  at module load time — they're already loaded during cold start.</div>
</div>

<div class="pa-risk warn">
  <div class="pa-rtitle">🟡 Event pooling churn (legacy event system)</div>
  <div class="pa-where">JS thread — destructor, releasePooledEvent</div>
  <div class="pa-why">The synthetic-event pool still churns in react-navigation builds (visible in the
  profile as <code>beginEvent</code> + <code>releasePooledEvent</code> ≈ 12 ms). This is
  framework overhead: the JS thread is busy for a full frame after the press before reconcile even
  starts.</div>
</div>

<div class="pa-risk good">
  <div class="pa-rtitle">🟢 EarlyPostImeInputStage delay (Android / OEM)</div>
  <div class="pa-where">UI thread — before React sees the event</div>
  <div class="pa-why">The 9 ms <code>EarlyPostImeInputStage</code> (two binder calls to
  InputManagerService) is an Android / OEM tax — seen on Samsung One UI. There is nothing
  React Native can do about it. It's real latency for the user but not attributable to your app
  code. On stock Android / Pixel it is typically &lt;2 ms.</div>
</div>

## Summary — the press round-trip in numbers

| Phase | Thread | Typical cost | Your code's contribution |
| --- | --- | ---: | --- |
| Input dispatch (Android) | <span class="pa-chip pa-ui">UI</span> | 9–14 ms | None — OS + OEM code |
| React hit-test (`TouchTargetHelper`) | <span class="pa-chip pa-ui">UI</span> | 1–4 ms | Proportional to shadow-tree depth |
| JS event routing (`topTouchStart/End`) | <span class="pa-chip pa-js">JS</span> | 1–12 ms | Library overhead (synthetic events) |
| Your `onPress` handler | <span class="pa-chip pa-js">JS</span> | 0–∞ | **100% your code** |
| React reconciliation | <span class="pa-chip pa-js">JS</span> | 1–30 ms | Proportional to re-render subtree size |
| Fabric commit (`completeRoot`) | <span class="pa-chip pa-js">JS</span> | 5–60 ms | Proportional to new node count |
| Native mount (MountItemDispatcher) | <span class="pa-chip pa-ui">UI</span> | 2–4 ms | Proportional to mutation list size |
| HWUI draw + eglSwap | <span class="pa-chip pa-rt">RT</span> | 3–8 ms | Proportional to dirty layer count |

<div class="pa-callout-good">
  <strong>The rule of thumb:</strong> for a press to feel instant, the sum of all JS-thread phases
  must complete within one vsync (~16.7 ms at 60 Hz, ~11 ms at 90 Hz). The OS input delay
  (~9–14 ms) is already eating most of that budget before your code runs.
  <em>Every millisecond you spend in <code>onPress</code>, reconciliation, or
  <code>completeRoot</code> is a millisecond the user waits for a response.</em>
</div>

<footer class="post-footnote">
Data: <code>perf-results/_nav/react-navigation-nav.perfetto-trace</code> (press pipeline) +
<code>perf-results/_nav/react-navigation-nav-hermes.json</code> (JS call stacks). Open any
<code>.perfetto-trace</code> file at <a href="https://ui.perfetto.dev">ui.perfetto.dev</a> and search
for <code>deliverInputEvent</code> to find the same data interactively. Full research repo:
<a href="https://github.com/AndreiCalazans/StateOfReactNativeNavigation">StateOfReactNativeNavigation</a>.
Companions: <a href="/posts/2026-06-06-react-native-navigation-cold-start/">cold start</a> ·
<a href="/posts/2026-06-07-the-cost-of-navigating/">cost of navigating</a> ·
<a href="/posts/2026-06-07-navigating-to-a-heavy-screen/">heavy screen</a> ·
<a href="/posts/2026-06-07-the-cost-of-expo/">cost of Expo</a>.
</footer>
