---
title: "Which React Native Animation Library Should You Use for Performance?"
description: "I benchmarked Animated (native driver), Reanimated 4, and react-native-ease across four animation types on Android — measuring UI + JS frame drops, per-thread CPU, and memory. The winner depends entirely on whether a gesture is involved."
publishDate: "2026-07-15"
tags: ["react-native", "performance", "android", "reanimated", "animations", "maestro"]
draft: true
---

React Native's animation story is fragmented. You can reach for the built-in
`Animated` API, [Reanimated](https://docs.swmansion.com/react-native-reanimated/),
or newer entrants like [react-native-ease](https://github.com/AppAndFlow/react-native-ease).
They all animate a box. The interesting question is: **if performance is your
primary concern, which one should you pick?**

So I built a harness and measured it. Everything here is reproducible —
[**AndreiCalazans/react-native-animation-performance**](https://github.com/AndreiCalazans/react-native-animation-performance).

## The setup

Three approaches, all on the latest versions (Nov 2025):

- **Animated** — RN 0.86's `Animated` API with `useNativeDriver: true`
- **Reanimated** — `react-native-reanimated` 4.5.0 (+ `react-native-worklets` 0.10.0)
- **Ease** — `react-native-ease` 0.7.3 (declarative, wraps native platform animators)

Four animation types, taken straight from how animations actually show up in apps:

1. **Touch** — animate after a touch event (a transient pop)
2. **State** — animate after a React state update (translate + fade)
3. **Scrub** — animate during continuous user input (drag-driven translate)
4. **Loop** — animate in a 45-second loop (continuous rotation)

And three markers: **memory (PSS)**, **FPS on the UI and JS threads**, and
**JS-thread CPU busyness** — because a saturated JS thread blocks everything
else your app wants to do.

A few decisions that matter:

- **Android, release build, New Architecture (Fabric)**, on a physical 90 Hz
  device (so the frame budget is 11.1 ms, not 16.7). Dev builds cripple
  Reanimated and RN, so they'd be meaningless.
- **60 boxes animate at once.** A single box hits the refresh ceiling on every
  library and tells you nothing. Sixty makes the cost visible. (This choice has
  consequences — see the caveat at the end.)
- **[Maestro](https://maestro.mobile.dev/)** drives every interaction so runs
  are identical and repeatable. One full flow per test case.

### How each number was captured

- **UI + JS frame drops** come from a native frame-drop observer:
  `Window.OnFrameMetricsAvailableListener` on a background thread for the UI
  (main) thread, and a JS `requestAnimationFrame` sampler for the JS thread,
  aggregated natively per screen. `droppedRatio` is refresh-rate-normalized, so
  90 Hz and 60 Hz devices are directly comparable.
- **Memory** is host-side `adb shell dumpsys meminfo <pid>` polled across the
  measurement window — PSS total, Java heap, native heap, graphics.
- **JS-CPU busyness** is per-thread CPU jiffies from `/proc/<pid>/task/<tid>/stat`
  for the `mqt_v_js` thread, sampled across the same window. The JS-thread
  dropped-frame ratio is a second, independent read on the same thing.

The app logs `START`/`STOP` markers around each interaction; a host script
aligns the memory and CPU samples to that exact window and pulls the natively
aggregated frame stats. Median of 3 runs throughout.

## Results

`drop` = refresh-normalized dropped-frame ratio (lower is better). `cpu%` is per
single core. Memory is PSS in MB.

### Type 1 — Touch (transient pop)

| lib | UI drop | UI fps | JS drop | JS cpu% | PSS MB |
|---|--:|--:|--:|--:|--:|
| Animated   | 0.031 | 90.5  | 0.026 | 4.6 | 186 |
| Reanimated | 0.060 | 75.3  | 0.030 | 4.7 | 233 |
| **Ease**   | **0.024** | **101.3** | 0.025 | 4.6 | **185** |

### Type 2 — State update (translate + fade)

| lib | UI drop | UI fps | JS drop | JS cpu% | PSS MB |
|---|--:|--:|--:|--:|--:|
| Animated   | 0.061 | 81.4  | 0.032 | 5.0 | 188 |
| Reanimated | 0.081 | 73.0  | 0.034 | 5.1 | 227 |
| **Ease**   | **0.027** | **103.2** | 0.026 | 4.2 | **184** |

### Type 3 — Scrub (gesture-driven) — this is where they split

| lib | UI drop | UI fps | JS drop | JS fps | **JS cpu%** | proc cpu% |
|---|--:|--:|--:|--:|--:|--:|
| Animated       | 0.096 | 79.1 | **0.258** | **67.0** | **29.3** | 70.5 |
| **Reanimated** | 0.386 | 57.4 | 0.089 | 86.4 | **2.9**  | **29.7** |
| Ease           | 0.157 | 87.8 | 0.047 | 86.6 | 13.0 | 42.9 |

### Type 4 — 45s loop (60 boxes rotating)

| lib | UI drop | UI fps | UI cpu% | proc cpu% | PSS MB |
|---|--:|--:|--:|--:|--:|
| Animated   | 0.298 | 61.7 | 33.5 | 109.9 | 194 |
| Reanimated | 0.331 | 56.4 | **61.9** | **150.9** | 241 |
| **Ease**   | **0.184** | **65.8** | **31.0** | **105.2** | 196 |

## What the data says

**Only scrubbing loads the JS thread.** For touch, state, and loop, JS CPU sits
at the idle floor (~4–5%) on all three libraries, because the animation runs off
the JS thread — the native driver, worklets, and native animators all keep JS
free once the animation is going. Scrubbing is the fork in the road:

- **Animated** drives the value with `PanResponder` → `Animated.Value.setValue()`
  on **every move event, on the JS thread**. Result: **29% JS CPU and a quarter
  of JS frames dropped.** That is precisely the failure mode where a busy JS
  thread starts blocking everything else. `useNativeDriver` doesn't save you
  here — you can't native-drive a value you're setting from JS each frame.
- **Reanimated** runs the pan gesture and the value update **entirely on the UI
  thread**. The JS thread barely notices (2.9% CPU, 86 fps). This is the whole
  reason Reanimated exists, and the data backs it up. (It's also worth
  remembering the flip side of that architecture — see
  [Reanimated Can Block Your JS Thread](/posts/reanimated-blocking-js-thread/).)
- **Ease** has to update its `animate` prop from React state on each move — a
  re-render per input event — so it lands in the middle (13% JS CPU). Its own
  docs are honest that gesture-driven animation is a non-goal.

**Memory: Reanimated costs ~50 MB more.** It consistently carries a higher PSS,
almost all of it in the **native heap** (~140 MB vs ~98 MB), from the
worklets/C++ runtime. **Ease and Animated are tied for lightest** — both are
thin wrappers with no extra runtime.

**At 60 nodes, per-node cost dominates the UI thread.** For touch/state/loop,
**Ease drops the fewest frames and burns the least CPU**, with **Animated close
behind**. **Reanimated is the heaviest** whenever many nodes animate at once —
the 45s loop pushes it to **62% main-thread CPU and 151% process CPU**, because
its `useAnimatedStyle` mapper runs per node, every frame, on the UI thread.
Sixty nodes is sixty times that work.

## So, which one?

There's no universal winner. Pick based on which cost your screen actually pays:

- **A gesture drives the animation (scrub, drag, pinch, swipe)? → Reanimated.**
  It's the only one that keeps continuous input off the JS thread. Pay the ~50 MB
  and move on.
- **Declarative state / enter-exit / looping / touch feedback, and you care
  about memory, CPU, and battery? → react-native-ease.** Lightest, lowest CPU,
  fewest dropped frames in those cases, and it keeps JS nearly idle. Just don't
  scrub with it.
- **Animated (`useNativeDriver: true`)** is the dependency-free middle ground —
  fine for touch/state/loop — **but never for scrubbing.**

Blunt version: **Reanimated when a finger is dragging something; Ease (or the
native driver) for everything else.** And never scrub with JS-driven
`Animated.setValue`.

## The caveat you should not skip

The harness animates **60 independent nodes at once.** That deliberately
punishes *per-node* overhead and rewards *whole-tree native* approaches. It's
why Reanimated looks heavy in the loop and scrub UI numbers.

For a **single hero element** — the far more common real-world case —
Reanimated's UI-thread cost mostly vanishes, while its JS-thread-freeness stays.
At one node, Reanimated is likely the all-round best for anything interactive.

So take the *JS-thread scrub ranking* as robust and design-independent (Animated
saturates JS, Reanimated doesn't, Ease is between). Take the *UI-thread loop
ranking* (Reanimated heaviest) as partly an artifact of 60 nodes, and re-measure
at your real node count. The memory numbers hold regardless.

Full methodology, the native frame observer, the Maestro flows, and every raw
number are in the repo:
[**AndreiCalazans/react-native-animation-performance**](https://github.com/AndreiCalazans/react-native-animation-performance).
