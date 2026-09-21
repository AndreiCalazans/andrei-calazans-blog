---
title: "The KMP-on-iOS Scaling Problem That Rust UniFFI Fixes"
description: "Kotlin Multiplatform makes you write a hand-maintained bridge layer on iOS — one file per domain that wraps, streams, and re-maps every Kotlin type into Swift. This is the anti-corruption layer, what it costs, and why a Rust + UniFFI core deletes it as a standing module."
publishDate: "2026-09-19"
tags: ["kotlin-multiplatform", "kmp", "rust", "uniffi", "ios", "swiftui", "mobile-architecture", "ffi"]
---

I have written two posts on sharing mobile business logic: one measuring
[how KMP scales on iOS](/post/2026-09-14-how-kmp-with-swiftui-scales-on-ios/),
and one on
[what a Rust core looks like on iOS and Android](/post/2026-09-18-shared-business-logic-in-rust/).
Both skated past a cost that decides how a KMP app feels to work in day to day:
**the bridge layer iOS is forced to hand-maintain.**

In the KMP scaling post I mentioned it in one line — feature packages compile
against Swift contracts, and "only a thin boundary layer imports the Kotlin
framework and adapts it into Swift's idiom." That line hides a whole module. This
post opens it: what that boundary layer actually does, why KMP *forces* you to
write it, and whether a Rust + UniFFI core makes you write it too.

The short answer: **KMP makes the bridge mandatory, and Rust deletes it as a
standing per-domain module** — because the thing the bridge repairs never happens
in the first place. Here is the whole argument.

## 1. The anti-corruption layer

On iOS, KMP ships your shared layer as one linked framework. Swift can call into
it. But you do not want your SwiftUI features calling Kotlin types directly, and
in a production KMP codebase they do not. Between the exported Kotlin and the
feature code sits a module — I will call it the **bridge layer** — that converts
Kotlin into the app's own native Swift types. No Kotlin type reaches a feature.
The view, the presentation model, and the tests compile against Swift only.

It is not a convenience wrapper. It is an **anti-corruption layer**: a boundary
whose one job is to keep the foreign type system from leaking into yours. And it
is not one file — it is **one file per domain**. Earnings, cash, watchlist,
session, and so on, each get their own `Shared<Domain>.swift`. In the codebase I
measured, there are around 30 of them.

Take one domain — a repository that streams a value to the UI. Its bridge file
does four distinct jobs.

### F1 — Wrap the Kotlin object for Swift concurrency

The exported Kotlin repository arrives on iOS as an **Objective-C-imported
class** with no `Sendable` conformance. Swift 6 strict concurrency *refuses to
compile* code that hands a non-`Sendable` value into a `Task`. So the bridge
wraps it exactly once, asserting safety by hand:

```swift
public struct SharedEarn: @unchecked Sendable {   // the assertion
    private let repository: Shared.EarnRepository  // ObjC-imported Kotlin class
    public init(repository: Shared.EarnRepository) { self.repository = repository }
}
```

`@unchecked` means "compiler, stop checking; I promise this is safe." That
promise has to be paid for with a written safety argument — here, that the Kotlin
object is constructor-frozen and its mutable state lives behind Kotlin's
coroutine machinery, which already serializes access. Without this wrap, the code
does not build.

### F2 — Turn the Kotlin Flow into an AsyncStream

The reactive read is a Kotlin `Flow`. KMP's Swift-export tool bridges a `Flow` as
a Swift `AsyncSequence`, but it *cannot* bridge a `Flow`-typed interface member.
So a top-level Kotlin function re-exposes the stream, and the bridge collects it
inside an owned `Task`, forwarding values into an `AsyncStream` with cancellation
on teardown:

```swift
for await value in earningReadings(repository: repository) {
    continuation.yield(EarningResult(shared: value))   // map, then yield
}
continuation.finish()
```

### F3 — Map every Kotlin type to a native Swift type

This is the bulk of the bridge by line count, and it is where the correctness
guarantees live. `Shared.EarningSummary` becomes a native `EarningSummary`, field
by field. It is not mechanical copying — the Objective-C export **erases** things
that must be rebuilt:

- **Money and decimals.** Kotlin value classes over `String` erase to a bare
  `NSString` at the ObjC boundary. The bridge re-parses them, and *fails the
  whole reading* if the money will not parse, rather than showing a wrong balance.
- **URLs.** A typed `HttpUrl` erases to a plain string, so the bridge
  re-asserts the scheme allowlist the erasure discarded.
- **Enums.** Switches are exhaustive with no `default`, so a new Kotlin case is a
  *compile error* on iOS instead of a silently dropped branch.

```swift
public extension EarningSummary {
    init(shared: Shared.EarningSummary) throws {
        self.init(
            // value class → NSString → re-parsed; a break fails the reading
            earningPercentage: try decimal(erasedDecimalText: shared.earningPercentage),
            offerings: try shared.offerings.map(OfferingSummary.init(shared:)),
            hasUnreadableOfferings: shared.hasUnreadableOfferings)
    }
}
```

### F4 — Build the native repository the features inject

Finally the bridge assembles a native Swift value — a struct of closures — that
feature code injects through its dependency system. Features never see the Kotlin
object; they see this.

```swift
public func makeRepository() -> EarnRepository {
    EarnRepository(
        observe: { readings(repository: repository) },   // F2
        refresh: { repository.refresh() },
        promoCard: { name in /* map through F3 */ })
}
```

### The asymmetry: Android pays none of this

Here is the part that makes the bridge feel unfair. **Android is Kotlin the whole
way up.** Its ViewModel holds the Kotlin repository and calls `observe()`
directly — no wrap, no stream adapter, no type mapping, no rebuilt struct:

```kotlin
class EarningViewModel(private val earn: EarnRepository) : ViewModel() {
    val state = earn.observe()               // the Kotlin Flow, used as-is
        .map { render(it) }
        .stateIn(viewModelScope, WhileSubscribed(), Loading)
}
```

The bridge is an **iOS-only tax**. It exists because two runtimes with different
type systems and different memory models have to meet, and Swift is the side that
has to do the meeting.

## 2. Why KMP forces the bridge

The tax is not tooling immaturity. It is the *shape of what KMP exports*. KMP
compiles Kotlin to a native framework **through Objective-C interop**, so
everything crosses as an ObjC-imported type. Every job the bridge does is
repairing something that export took away:

<div class="fg">
<div class="fg-box">
<code>Kotlin class → ObjC class, no Sendable</code><br/>
<code>Kotlin Flow → shim with holes</code><br/>
<code>value classes / type args / refinements erase</code><br/>
<code>exported class is reference-typed, ObjC-shaped</code>
<div class="fg-note">what Objective-C export takes away</div>
</div>
<div class="fg-arrow">▼</div>
<div class="fg-box fg-link">
<code>F1 wrap · F2 stream · F3 re-map · F4 rebuild</code>
<div class="fg-note"><span class="fg-tag">the bridge repairs each one — per domain</span></div>
</div>
</div>

That framing is the whole key to the Rust comparison. If a different boundary
does not *take these things away*, there is nothing to repair, and the layer does
not need to exist.

## 3. What Rust + UniFFI exports instead

I built a small Rust core with [UniFFI](https://mozilla.github.io/uniffi-rs/) —
the full walkthrough and code are in
[the Rust post](/post/2026-09-18-shared-business-logic-in-rust/), and the repo is
[AndreiCalazans/mobile-rust](https://github.com/AndreiCalazans/mobile-rust).

The decisive difference: **UniFFI does not go through Objective-C.** Your Rust
compiles to a native library — a `.a` static lib on iOS, a `.so` on Android —
and that is where the logic actually runs, as compiled Rust machine code, not as
Swift and not interpreted. On top of it UniFFI generates a *thin native-Swift and
native-Kotlin binding*: a small wrapper that marshals arguments across the C ABI
and calls into the Rust binary. The call path is
`Swift feature → generated Swift wrapper → C ABI → compiled Rust`, the same shape
as calling any C library from Swift.

What matters for the bridge argument is the *shape of that wrapper*. UniFFI emits
real Swift `struct`s and `enum`s, real Kotlin `data class`es and `sealed class`es
— not a foreign class you then re-shape. When Rust hands a value back, the wrapper
copies the field bytes into a plain Swift value living in Swift memory; from that
point the Rust copy is gone. That copy is exactly why the type-mapping repair (F3)
disappears — the native type *is* the generated type, with no second type to map
into. You declare it once in Rust:

```rust
#[derive(Debug, Clone, uniffi::Record)]
pub struct AssetPrice {
    pub symbol: String,
    pub name: String,
    pub price_usd: String,
    pub change_day_percent: f64,
}
```

And the iOS consumer holds the generated object and calls it. **There is no
`SharedEarn`-equivalent. There is no per-domain bridge at all:**

```swift
@MainActor
final class AppModel: ObservableObject {
    private let core = AppCore()        // Rust-backed handle, ARC-managed
    @Published var bitcoin: AssetPrice?

    func loadBitcoin() {
        Task {
            do { bitcoin = try await core.fetchBitcoin() }   // async throws, native
            catch { /* … */ }
        }
    }
}
```

That is the endpoint of the argument: the ViewModel calls the generated Rust type
straight, with nothing between it and the core. Now walk the four jobs.

## 4. Job by job: does Rust pay the tax?

| Bridge job | KMP on iOS | Rust + UniFFI | Verdict |
|---|---|---|---|
| **F1** — `@unchecked Sendable` wrap | Required; ObjC class is not `Sendable` | Generated types are marked `Sendable` where valid; nothing to wrap | **Gone** |
| **F2** — Flow → `AsyncStream` | Required; export shim has holes | `async fn` maps straight to `async throws` / `suspend` | **Gone** for request/response; caveat for streams |
| **F3** — Kotlin type → native type | Required; ObjC erasure loses value classes, refinements | The generated type *is* the only type; nothing to map to | **Gone** |
| **F4** — build native dep struct | Rebuilds a Swift shape | The generated object is already native | **Reduced to ordinary DI** |
| **New:** object lifecycle | N/A (JVM/ARC own it) | `uniffi::Object` is a Rust-heap handle; Kotlin must `.close()` | **New, Kotlin-only, narrow** |

**F1 (Sendable) is gone.** The Sendable problem was a *consequence of ObjC
import*. UniFFI generates Swift types from scratch and marks them `Sendable` when
the Rust side proves it — records are immutable value data, trivially sendable.
No foreign class, no `@unchecked`, no audited safety argument.

**F2 (async) is gone for the common case — with one honest caveat.** An
`async fn fetch_bitcoin() -> Result<AssetPrice, CoreError>` becomes
`func fetchBitcoin() async throws -> AssetPrice` in Swift and
`suspend fun fetchBitcoin(): AssetPrice` in Kotlin, directly. No owned `Task`, no
continuation plumbing. The caveat: **UniFFI has no native `Flow` type.** A KMP
repository that exposes a hot `observe(): Flow<…>` has no direct UniFFI
equivalent. To get the same reactive shape you return a callback and adapt it
into a Swift `AsyncStream` or a Kotlin `Flow` natively — a reduced,
*once-per-stream-shape* version of F2, not the full per-domain mapping layer. My
demo is request/response only, so it never hits this, but a reactive production
core would pay a small, bounded amount of F2-style glue.

**F3 (type mapping) is gone, and it is the biggest win.** F3 was entirely a
repair for ObjC erasure. UniFFI generates the native type as the *only* type —
there is no `Shared.EarningSummary` and a separate native `EarningSummary`, just
one `AssetPrice`. The money re-parsing, the URL re-validation, the re-mapping
switches: none exist, because the value never erased. `price_usd: String` in Rust
is `priceUsd: String` in Swift, same bytes.

The one F3 side effect that was actually a *feature* — a shared-side change
becoming a compile error — moves rather than vanishes: regenerate the bindings and
a removed field or a new enum variant breaks the native call sites at compile
time. Same protection, enforced by regeneration instead of a hand-written
exhaustive switch.

**F4 (dependency shape) shrinks to ordinary DI.** The generated object is already
the native thing you inject. You still choose how to inject it and how to fake it
in tests, but that is normal dependency injection, not a boundary-repair layer.

## 5. The new tax Rust introduces

Rust does not get this for free. It *moves* one cost rather than removing all of
them, and this is the thing I actually learned building the demo (there is a
longer write-up in the Rust post's
[annex on memory leaks with Objects on Kotlin](/post/2026-09-18-shared-business-logic-in-rust/#annex-memory-leaks-with-objects-on-kotlin)).

A `uniffi::Record` copies by value and is safe. But a `uniffi::Object` — a
handle to an instance on the Rust heap — is different. Swift's ARC calls `deinit`
and frees it invisibly. **Kotlin's GC frees the wrapper, not the Rust instance**,
so you must close it:

```kotlin
override fun onCleared() {
    core.close()   // free the Rust object deterministically
}
```

UniFFI does register a `Cleaner` as a backstop, so a forgotten `close()` is
usually collected *eventually* on GC. But that backstop is **pressure-blind and
untimed**: the JVM cannot see the Rust heap behind the pointer, so it does not
know a tiny Kotlin wrapper is holding megabytes of Rust memory, and it will not
run the cleaner under Rust-side pressure. Do not rely on it for many or large
objects.

When it matters is specific:

- **A non-issue:** one app-lifetime `AppCore` you never close. It lives as long
  as the process, so a never-freed handle costs nothing.
- **Leaks every time:** many objects, or short-lived ones — an object created per
  request or per list item and dropped. Each one leaks until the untimed cleaner
  happens to run.

Two rules remove the footgun by design rather than trusting the cleaner or the
linter: **return Records, never Objects**, so the only closeable things are the
few facades you deliberately hold; and keep those Objects **few and long-lived**,
closing screen-scoped ones in one place with a base `RustViewModel` so it is not
per-developer discipline.

## 6. Streams: the one glue layer Rust keeps

F2 was the one job the table marked "caveat for streams," and it is worth
opening because a real reactive core hits it every day. A KMP
`observe(): Flow<…>` has no direct UniFFI equivalent — **UniFFI has no native
`Flow`, `AsyncStream`, or `AsyncIterator` type.** Its async support stops at the
request/response shape: an `async fn` maps to `async throws` and `suspend`, but a
function cannot *return* a continuous stream across the C ABI.

So you drive values the other way. Instead of returning a stream, Rust **pushes**
values into a foreign callback, and each platform wraps that callback in its own
reactive idiom. The key difference from the KMP bridge: this is written **once
per stream shape**, not once per domain — and the mapping is trivial, because the
values crossing the boundary are already generated native types (no F3).

### The Rust side: a callback interface plus a cancel handle

You export a *foreign trait* with `callback_interface`. Rust calls its methods to
emit; the foreign side implements them. You also return a `uniffi::Object` handle
so the collector can tell Rust to stop — this is the one place a stream reuses the
Object lifecycle from section 5.

```rust
#[derive(uniffi::Record)]
pub struct AssetPrice { pub symbol: String, pub price_usd: String }

// The foreign side (Swift/Kotlin) implements this; Rust calls it to emit.
#[uniffi::export(callback_interface)]
pub trait PriceObserver: Send + Sync {
    fn on_next(&self, price: AssetPrice);
    fn on_error(&self, message: String);
    fn on_complete(&self);
}

// Returned to the collector so it can stop the stream on teardown.
#[derive(uniffi::Object)]
pub struct Subscription { cancelled: Arc<AtomicBool> }

#[uniffi::export]
impl Subscription {
    pub fn cancel(&self) { self.cancelled.store(true, Ordering::SeqCst); }
}

#[uniffi::export]
pub fn observe_price(symbol: String, observer: Box<dyn PriceObserver>) -> Arc<Subscription> {
    let cancelled = Arc::new(AtomicBool::new(false));
    let flag = cancelled.clone();
    spawn_on_runtime(async move {
        // …emit observer.on_next(price) as prices arrive…
        // …check flag between emits, then observer.on_complete()…
    });
    Arc::new(Subscription { cancelled })
}
```

### Swift: wrap the callback in an `AsyncStream`

The generated `PriceObserver` protocol is native Swift. You implement it once and
forward into an `AsyncStream` continuation, wiring `onTermination` back to
`cancel()` so a dropped collector stops Rust. This is the *reduced* F2 — a
continuation and a `Task`, but no per-field type mapping.

```swift
func priceStream(symbol: String) -> AsyncThrowingStream<AssetPrice, Error> {
    AsyncThrowingStream { continuation in
        final class Observer: PriceObserver {
            let c: AsyncThrowingStream<AssetPrice, Error>.Continuation
            init(_ c: AsyncThrowingStream<AssetPrice, Error>.Continuation) { self.c = c }
            func onNext(price: AssetPrice) { c.yield(price) }        // native type, no map
            func onError(message: String) { c.finish(throwing: CoreError.stream(message)) }
            func onComplete() { c.finish() }
        }
        let sub = observePrice(symbol: symbol, observer: Observer(continuation))
        continuation.onTermination = { _ in sub.cancel() }   // teardown → Rust stop
    }
}

// The feature collects it with plain Swift concurrency:
for try await price in priceStream(symbol: "BTC") { render(price) }
```

### Kotlin: wrap the same callback in `callbackFlow`

Kotlin gets the identical generated `PriceObserver` interface and adapts it with
`callbackFlow`, whose `awaitClose` plays the role Swift's `onTermination` does.
The result is a real `Flow` the ViewModel collects with `stateIn` — the same
shape KMP gave for free, now built once here.

```kotlin
fun priceFlow(symbol: String): Flow<AssetPrice> = callbackFlow {
    val observer = object : PriceObserver {
        override fun onNext(price: AssetPrice) { trySend(price) }   // native data class
        override fun onError(message: String) { close(CoreException(message)) }
        override fun onComplete() { close() }
    }
    val sub = observePrice(symbol, observer)
    awaitClose { sub.cancel() }        // collector cancels → Rust stop
}

// The ViewModel collects it exactly like the KMP version:
val state = priceFlow("BTC")
    .map { render(it) }
    .stateIn(viewModelScope, WhileSubscribed(), Loading)
```

### What this costs versus what KMP charged

Line this up against the KMP bridge and the difference is the *unit of work*.

| Concern | KMP bridge (F2) | Rust callback adapter |
|---|---|---|
| **Written how often** | Per domain, on iOS | Once per stream *shape*, both platforms |
| **Type mapping inside** | Full F3 re-map per value | None — values are generated native types |
| **Cancellation** | Owned `Task` + `continuation.finish()` | `onTermination` / `awaitClose` → `cancel()` |
| **Kotlin cost** | Zero (uses the Flow directly) | Small — same adapter as iOS |

## Verdict

The KMP bridge layer is a repair crew for damage done by Objective-C export.
Rust with UniFFI does not go through Objective-C, so most of the damage never
happens, so
most of the crew is not hired.

<div class="fg">
<div class="fg-box">
<code>KMP: Shared.EarnRepository (ObjC class)</code><br/>
<code>↓  bridge layer — per domain ×~30</code><br/>
<code>↓  F1 wrap · F2 stream · F3 map · F4 build</code><br/>
<code>↓  EarningModel (native)</code>
<div class="fg-note">the layer stands, and grows with every domain</div>
</div>
<div class="fg-arrow">▼</div>
<div class="fg-box fg-link">
<code>Rust: AppCore / AssetPrice — generated native Swift</code><br/>
<code>↓  (no bridge layer)</code><br/>
<code>↓  AppModel calls the generated types directly</code>
<div class="fg-note"><span class="fg-tag">F1, F3 gone · F2 only for streams · F4 is DI</span></div>
</div>
</div>

- **F1 (Sendable) and F3 (type mapping): gone.** Pure ObjC-erasure repairs, and
  Rust never erases.
- **F2 (async): gone** for request/response; a reduced version returns only for
  continuous streams, once per stream shape, not per domain.
- **F4 (dependency shape): shrinks** to ordinary DI.
- **In exchange:** one Kotlin-only cost — deterministic `.close()` for
  `uniffi::Object` handles, whose Cleaner backstop is untimed and Rust-heap-blind
  — narrow, and designable-away.

So the honest headline: **a Rust core removes the anti-corruption layer as a
standing per-domain module.** It does not remove *all* boundary work — a reactive
core still adapts streams, and Kotlin still manages object lifetime — but it
deletes the tens-of-files-of-mapping shape KMP forces on iOS, because the thing
that layer repairs does not occur.

This is the cost my [KMP scaling post](/post/2026-09-14-how-kmp-with-swiftui-scales-on-ios/)
measured from the outside — the bridge is what keeps a Kotlin change from
rebuilding every feature — seen now from the inside. It buys real isolation, and
it is a real, growing, per-domain line item. Rust's boundary does not present
that bill, because Objective-C is never in the path.

The Rust proof of concept — core, generated bindings, iOS and Android apps — is
at
[github.com/AndreiCalazans/mobile-rust](https://github.com/AndreiCalazans/mobile-rust).
