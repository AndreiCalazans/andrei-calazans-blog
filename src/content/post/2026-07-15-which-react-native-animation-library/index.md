---
title: "Which React Native Animation Library Should You Use for Performance?"
description: "I benchmarked Animated (native driver), Reanimated 4, and react-native-ease across four animation types on Android — measuring UI + JS frame drops, per-thread CPU, and memory. The winner depends on whether a gesture is involved — plus what Worklets Bundle Mode does to Reanimated's memory."
publishDate: "2026-07-15"
tags: ["react-native", "performance", "android", "reanimated", "animations", "maestro"]
---

React Native's animation story is fragmented. You can reach for the built-in
`Animated` API, [Reanimated](https://docs.swmansion.com/react-native-reanimated/),
or newer entrants like [react-native-ease](https://github.com/AppAndFlow/react-native-ease).
They all animate a box. The interesting question is: **if performance is your
primary concern, which one should you pick?**

So I built a harness and measured it. Everything here is reproducible —
[**AndreiCalazans/react-native-animation-performance**](https://github.com/AndreiCalazans/react-native-animation-performance).

## The setup

Three approaches:

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

Same drag, three libraries. Watch the JS-thread numbers, not just the pixels —
Animated is dragging the value on the JS thread the whole time:

<video controls muted playsinline loop preload="metadata" style="max-width: 300px; width: 100%; display: block; margin: 0 auto;">
<source src="/videos/rn-anim-animated-scrub.mp4" type="video/mp4" />
</video>

*Animated — `PanResponder` → `setValue` on the JS thread (29% JS CPU, 26% JS frames dropped).*

<video controls muted playsinline loop preload="metadata" style="max-width: 300px; width: 100%; display: block; margin: 0 auto;">
<source src="/videos/rn-anim-reanimated-scrub.mp4" type="video/mp4" />
</video>

*Reanimated — gesture on the UI thread; the JS thread stays free (2.9% JS CPU).*

<video controls muted playsinline loop preload="metadata" style="max-width: 300px; width: 100%; display: block; margin: 0 auto;">
<source src="/videos/rn-anim-ease-scrub.mp4" type="video/mp4" />
</video>

*Ease — a state update per move event (13% JS CPU).*

### Type 4 — 45s loop (60 boxes rotating)

| lib | UI drop | UI fps | UI cpu% | proc cpu% | PSS MB |
|---|--:|--:|--:|--:|--:|
| Animated   | 0.298 | 61.7 | 33.5 | 109.9 | 194 |
| Reanimated | 0.331 | 56.4 | **61.9** | **150.9** | 241 |
| **Ease**   | **0.184** | **65.8** | **31.0** | **105.2** | 196 |

Sixty boxes rotating for 45 seconds. This is where per-node UI-thread cost shows
up — Reanimated runs a `useAnimatedStyle` mapper per box, per frame:

<video controls muted playsinline loop preload="metadata" style="max-width: 300px; width: 100%; display: block; margin: 0 auto;">
<source src="/videos/rn-anim-animated-loop.mp4" type="video/mp4" />
</video>

*Animated — native driver.*

<video controls muted playsinline loop preload="metadata" style="max-width: 300px; width: 100%; display: block; margin: 0 auto;">
<source src="/videos/rn-anim-reanimated-loop.mp4" type="video/mp4" />
</video>

*Reanimated — 62% main-thread CPU, 151% process CPU (heaviest of the three).*

<video controls muted playsinline loop preload="metadata" style="max-width: 300px; width: 100%; display: block; margin: 0 auto;">
<source src="/videos/rn-anim-ease-loop.mp4" type="video/mp4" />
</video>

*Ease — native platform animators; fewest dropped frames, lowest CPU.*

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
thin wrappers with no extra runtime. *(This turns out to be fixable — see the
[Bundle Mode update](#update-reanimated-worklets-bundle-mode) below.)*

**At 60 nodes, per-node cost dominates the UI thread.** For touch/state/loop,
**Ease drops the fewest frames and burns the least CPU**, with **Animated close
behind**. **Reanimated is the heaviest** whenever many nodes animate at once —
the 45s loop pushes it to **62% main-thread CPU and 151% process CPU**, because
its `useAnimatedStyle` mapper runs per node, every frame, on the UI thread.
Sixty nodes is sixty times that work.

## So, which one?

There's no universal winner. Pick based on which cost your screen actually pays:

- **A gesture drives the animation (scrub, drag, pinch, swipe)? → Reanimated.**
  It's the only one that keeps continuous input off the JS thread. (And with
  Bundle Mode on, you don't even pay the memory premium — see below.)
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
at your real node count.

## Update: Reanimated Worklets Bundle Mode

After I posted this, [T.J. Żelawski](https://x.com/tjzeldev) asked the obvious
next question: what about Reanimated with [Worklets **Bundle
Mode**](https://docs.swmansion.com/react-native-worklets/docs/bundleMode/setup)
enabled? Instead of serializing every worklet as a string that the UI runtime
compiles at runtime, Bundle Mode compiles worklets into a separate bundle. Good
call — so I rebuilt the app with it on and re-measured.

To keep it honest I also re-ran a **fresh non-bundle baseline in the same
session** on the same device (PSS drifts between sessions, so both arms were
measured back-to-back). Median of 3 runs each. The result is striking:

| test | PSS off | PSS on | Δ PSS | native heap off | native heap on |
|---|--:|--:|--:|--:|--:|
| touch | 231 MB | 121 MB | **−110 MB** | 145 MB | 32 MB |
| state | 227 MB | 123 MB | **−104 MB** | 139 MB | 32 MB |
| scrub | 239 MB | 129 MB | **−110 MB** | 143 MB | 31 MB |
| loop  | 237 MB | 137 MB | **−100 MB** | 141 MB | 34 MB |

**Bundle Mode cuts Reanimated's memory by ~100 MB (~45%)**, essentially all of
it native heap (~142 MB → ~32 MB). That's not a tweak — it **erases the ~50 MB
premium** Reanimated had over Animated and Ease, and then some. With Bundle Mode
on, Reanimated is no longer the memory-heavy choice.

And frame rate / CPU? **Unchanged**, within run-to-run noise:

| test | UI drop off→on | UI fps off→on | JS cpu% off→on | proc cpu% off→on |
|---|--:|--:|--:|--:|
| touch | 0.067→0.057 | 74→77 | 4.6→4.7 | 47→45 |
| scrub | 0.382→0.365 | 58→59 | 2.8→2.8 | 30→30 |
| loop  | 0.323→0.319 | 59→58 | 2.9→2.9 | 152→151 |

That makes sense: Bundle Mode changes how worklets are *loaded* (memory, and
startup — which I didn't measure here), not how they *execute* per frame. So the
60-node UI-thread cost is untouched, but the memory objection to Reanimated
largely goes away.

**Revised bottom line:** if you're on Reanimated, turn Bundle Mode on — it's a
build-config change (babel `bundleMode` + a Metro config wrapper) that buys ~100
MB for free. And it weakens the main reason I'd previously steer memory-sensitive
screens away from Reanimated.

> Setup gotcha I hit: Bundle Mode writes generated worklet files into
> `node_modules/react-native-worklets/.worklets/`, and Metro's first build can
> fail with a *"Failed to get the SHA-1"* error because those files didn't exist
> when Metro built its file map. Running the bundle once populates them; the
> next build succeeds.

Full methodology, the native frame observer, the Maestro flows, the bundle-mode
comparison, and every raw number are in the repo:
[**AndreiCalazans/react-native-animation-performance**](https://github.com/AndreiCalazans/react-native-animation-performance).
