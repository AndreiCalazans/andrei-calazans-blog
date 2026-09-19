---
title: "What Does Shared Business Logic in Rust Look Like on iOS & Android?"
description: "Put the whole domain — session, repositories, use cases, networking — in Rust, and let SwiftUI and Compose sit on top. The bridge is auto-generated and gitignored. This walks through the idea, the generated bindings, what you lose in Swift and Kotlin at the call site, and whether it scales to hundreds of feature modules."
publishDate: "2026-09-18"
tags: ["rust", "ios", "android", "swiftui", "jetpack-compose", "uniffi", "mobile-architecture"]
---

You share business logic on mobile so you write the domain once. Kotlin
Multiplatform is the common answer. Rust is another one, and it goes lower: no
JVM, no Kotlin/Native runtime, one C ABI that both platforms already speak.

The question this post answers: **what does that actually look like on iOS and
Android?** I built a small proof of concept — a fake session, a user
repository, a REST call, and a GraphQL call — with all of it in Rust. The repo
is [AndreiCalazans/mobile-rust](https://github.com/AndreiCalazans/mobile-rust).

## 1. The idea: push Rust as high as it goes

The goal is to share the most you can. So draw the native/shared line as high as
possible and put everything under it in Rust.

<div class="fg">
<div class="fg-box">
<code>View · SwiftUI / Compose</code><br/>
<code>ViewModel</code>
<div class="fg-note">native, per platform</div>
</div>
<div class="fg-arrow">▼ intents · state ▲</div>
<div class="fg-box fg-link">
<code>Use cases · Repositories · Data sources</code><br/>
<code>Networking · Storage · Models</code>
<div class="fg-note"><span class="fg-tag">RUST — shared</span></div>
</div>
</div>

The View and ViewModel stay native. They render state and send intents. Below
that line is Rust: use cases, repositories, data sources, the HTTP client, the
GraphQL client, the models. iOS and Android hold **one object** and call its
methods.

In the PoC that object is `AppCore`:

```rust
#[derive(uniffi::Object)]
pub struct AppCore {
    http: reqwest::Client,
    users: UserRepository,
}

#[uniffi::export(async_runtime = "tokio")]
impl AppCore {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> { /* ... */ }

    pub fn login(&self, display_name: String) -> SessionState { /* ... */ }

    pub async fn define_words(&self, words: Vec<String>) -> Vec<WordEntry> { /* ... */ }

    pub async fn fetch_bitcoin(&self) -> Result<AssetPrice, CoreError> { /* ... */ }
}
```

That is the whole app surface. Networking is `reqwest` on `tokio`. The session,
the repository, the REST mapping, the GraphQL query — all Rust.

## 2. Required: the bridge must be auto-generated

Nobody wants to hand-write JNI glue and Objective-C shims. If you have to
maintain the bridge by hand, the whole thing is dead on arrival.

Three tools can produce the bridge:

- **cbindgen** — emits C headers only. You still hand-write all the JNI and
  Swift glue, and there is no async model. No.
- **Diplomat** — generates Kotlin and Swift, but has no native async bridge (no
  `suspend` / `async` mapping) and a restricted type subset. No.
- **[UniFFI](https://mozilla.github.io/uniffi-rs/)** — Mozilla's tool, built to
  share a Rust core between Firefox iOS and Android. It generates both bindings,
  maps `async fn` to Kotlin `suspend` and Swift `async`, and works with
  `tokio` + `reqwest`. Yes.

You mark Rust types and functions with proc macros (`#[uniffi::export]`,
`#[derive(uniffi::Record)]`), then run `uniffi-bindgen` against the compiled
library. It writes the Kotlin and the Swift.

**The ideal: gitignore the generated bindings.** They are a pure function of the
Rust API. If you regenerate them on every build, they cannot drift, so there is
no reason to commit them. In the PoC:

```gitignore
# Auto-generated FFI bindings — regenerated on every build, never committed
**/generated/
androidApp/**/jniLibs/
iosApp/Generated/
```

Android runs a Gradle task before Kotlin compiles; iOS runs a build phase before
"Compile Sources". Both call the same generator. Git tracks source only.

## 3. How it looks at the call site

You write the type once in Rust:

```rust
#[derive(uniffi::Record)]
pub struct AssetPrice {
    pub symbol: String,
    pub name: String,
    pub price_usd: String,
    pub change_day_percent: f64,
}

#[derive(uniffi::Enum)]
pub enum SessionState {
    LoggedOut,
    Active { user: User, token: String },
}
```

UniFFI generates the Swift:

```swift
public struct AssetPrice {
    public var symbol: String
    public var name: String
    public var priceUsd: String          // snake_case → camelCase, automatic
    public var changeDayPercent: Double
}

public enum SessionState {
    case loggedOut
    case active(user: User, token: String)
}
```

And the Kotlin:

```kotlin
data class AssetPrice(
    var symbol: String,
    var name: String,
    var priceUsd: String,
    var changeDayPercent: Double,
)

sealed class SessionState {
    object LoggedOut : SessionState()
    data class Active(val user: User, val token: String) : SessionState()
}
```

Consuming it is ordinary native code. iOS:

```swift
let core = AppCore()
let session = core.login(displayName: "Ada Lovelace")

Task {
    let btc = try await core.fetchBitcoin()   // async throws
    print("\(btc.symbol) = $\(btc.priceUsd)")
}
```

Android:

```kotlin
val core = AppCore()
val session = core.login("Ada Lovelace")

lifecycleScope.launch {
    val btc = core.fetchBitcoin()             // suspend
    println("${btc.symbol} = $${btc.priceUsd}")
}
```

An `async fn` in Rust is `async throws` in Swift and `suspend` in Kotlin. This
is not a wrapper you wrote. It runs on the app screen: fake login, a live
GraphQL bitcoin price, live REST word definitions — all through the one Rust
object.

## 4. Ergonomics: what you lose at the call site

Here is the honest part. When the data comes from Rust, it is plain data. Some
things you take for granted in Swift and Kotlin are gone.

**No methods on the data.** A `uniffi::Record` is fields only. In a pure-Swift
app you would write:

```swift
struct AssetPrice {
    let priceUsd: String
    var isExpensive: Bool { Double(priceUsd) ?? 0 > 50_000 }   // gone
    func formatted() -> String { "$\(priceUsd)" }              // gone
}
```

Across the bridge, `AssetPrice` has no `isExpensive` and no `formatted()`.
Behavior lives in Rust (expose another function) or in a native extension you
add on the generated type. Same in Kotlin — no computed properties, no methods,
no `companion object` helpers on the generated `data class`.

**No free serialization.** The generated `struct` is not `Codable`. The
generated `data class` is not `Parcelable` and has no `kotlinx.serialization`.
If a screen wants to put a model in a `Bundle` or encode it to JSON on the
native side, you wrap it. In practice you keep persistence in Rust — that is the
architecture anyway — so native types stay transient.

**Objects are handles, not values.** Records copy by value and are fine. But an
`#[derive(uniffi::Object)]` like `AppCore` is a reference to a Rust object. On
Kotlin it is `AutoCloseable`; you `.close()` it or scope it, because the JVM GC
will not free the Rust side for you:

```kotlin
override fun onCleared() {
    core.close()   // no equivalent needed in a pure-Kotlin ViewModel
}
```

Swift handles this with ARC and `deinit`, so it is invisible there. Kotlin makes
you think about it. This is the one real footgun — see the
[annex on memory leaks](#annex-memory-leaks-with-objects-on-kotlin) for what
Android Lint catches and how to design it away.

**Callbacks cross a thread boundary.** A Rust callback can fire on a `tokio`
thread. Native code must hop to the main dispatcher before touching UI. A
pure-native observer would already be on the right thread.

What you **keep** is most of what matters: value semantics on records, sealed
classes and enums with associated values and exhaustive `when` / `switch`,
nullability (`Option` → `T?`), native error handling (`Result` → `throws` /
typed exceptions), and native concurrency. Pattern matching survives:

```swift
switch session {
case let .active(user, _): show(user)
case .loggedOut:           showLogin()
}
```

```kotlin
when (session) {
    is SessionState.Active -> show(session.user)
    SessionState.LoggedOut -> showLogin()
}
```

The loss is real but narrow: no behavior on the data, no free
serialization, and manual cleanup for Rust-backed objects on Kotlin. Everything
else reads like code you would have written.

## 5. Scalability: does this hold at 400+ modules?

This is the question that decides whether the pattern is a toy. I wrote a
[separate post on how KMP scales on iOS](/post/2026-09-14-how-kmp-with-swiftui-scales-on-ios/);
the shape of the Rust answer is similar, because the constraint is the same.

**iOS and Android each link one artifact.** iOS links a `staticlib`; Android
loads one `.so`. However you split the Rust workspace into crates, the platform
sees a single library. That is the thing to watch — the same single-link tax KMP
pays with its umbrella framework.

The saving grace is the same too, and Cargo gives it to you directly:

**Crate-level caching recompiles only what changed.** A Cargo workspace shares
one `target/` directory. Split the domain into crates by change frequency:

<div class="fg">
<div class="fg-box">
<code>core-types · database · networking</code><br/>
<code>feature-auth · feature-search · feature-payments · …</code>
<div class="fg-note">one crate per real boundary · cached independently</div>
</div>
<div class="fg-arrow">▼</div>
<div class="fg-box fg-link">
<code>ffi</code> — thin UniFFI facade, re-exports the features
<div class="fg-note"><span class="fg-tag">the only crate that owns the bridge</span></div>
</div>
<div class="fg-arrow">▼</div>
<div class="fg-box">
<code>libapp_core.a / .so</code> — ONE link step
<div class="fg-note">the fixed tax</div>
</div>
</div>

Change one file in `feature-search` and Cargo recompiles that crate only, reuses
the cached object files for the other 399, then relinks. Incremental compilation
plus a high `codegen-units` count in the dev profile keeps that inner loop fast.
`uniffi_reexport_scaffolding!` lets each feature crate carry its own bridge and
the `ffi` crate combine them, so you are not funneling every module's
implementation through one file.

The rules that keep it honest:

- **Crates are compilation boundaries; modules are organization.** Split genuine
  domains into crates. Do not make every small module a crate — the metadata and
  link overhead adds up.
- **Keep the `ffi` crate thin.** It depends on the features and exposes a small
  stable surface. It does not own the app.
- **The link step is fixed per build and grows with total shared code.** You
  cannot cache it away, exactly like the KMP umbrella link. Keep the exported
  symbol surface small and let dead code strip.
- **Dev and release profiles differ.** Dev: `incremental = true`,
  `codegen-units = 256`, `lto = "off"`. Release: `lto = "thin"`,
  `codegen-units = 16`. Never run `codegen-units = 1` in the edit loop.

So: yes, it scales, under the same discipline KMP needs. Split by crate, cache
per crate, pay one link. The link floor is the number to watch as the shared
layer grows; crate boundaries are what keep everything above it cheap.

## Verdict

A Rust domain under SwiftUI and Compose works, and it reads well on both sides.
The bridge is generated and gitignored, `async` maps to `suspend` / `async`, and
the call sites look native. You give up behavior-on-data, free serialization,
and deterministic cleanup on Kotlin — a narrow, known cost. It scales to a large
feature set on the same terms any single-linked shared layer does: split into
crates, cache per crate, and defend the one link step.

The full PoC — Rust core, generated bindings, iOS and Android apps, running on a
simulator — is at
[github.com/AndreiCalazans/mobile-rust](https://github.com/AndreiCalazans/mobile-rust).

## Annex: memory leaks with Objects on Kotlin

The one thing that bites in practice. A `uniffi::Object` is a pointer to a Rust
instance on the Rust heap. Kotlin's GC frees the *wrapper*, not the Rust side —
that only frees promptly when you call `.close()`. Forget it and you risk
leaking Rust memory.
Records don't have this problem (they're copied data). Swift doesn't either
(ARC calls `deinit`). It's Kotlin + Objects only.

UniFFI does register a `Cleaner` as a backstop, so a forgotten close is usually
collected *eventually* on GC — but it's pressure-blind and untimed (the JVM
can't see the Rust heap behind the pointer), so don't rely on it for many or
large objects.

When it matters: many objects, or short-lived ones. One app-lifetime `AppCore`
you never close is a non-issue. Creating an object per request or per list item
and dropping it leaks every time.

**What Android Lint catches.** The generated class implements `AutoCloseable`,
so Lint's `Recycle` check (the same one that flags an unclosed `Cursor`) fires
on locally-scoped objects you create and don't close — for free, no config. What
it does *not* catch: an object held as a field with a custom teardown (a
`private val core = AppCore()` you must close in `onCleared()`), or an object
that escapes across your own layers. Escape analysis defeats every off-the-shelf
linter there.

**Recommendations — remove the footgun by design, don't rely on the linter:**

- Keep Objects **few and long-lived**. One `AppCore` at app scope.
- **Return Records, never Objects.** Records don't leak, so the only closeable
  things are the few facades you deliberately hold.
- For screen-scoped objects, close them in one place with a base class so it's
  not per-developer discipline:

```kotlin
abstract class RustViewModel : ViewModel() {
    private val closeables = mutableListOf<AutoCloseable>()
    protected fun <T : AutoCloseable> T.managed(): T { closeables += this; return this }
    override fun onCleared() { closeables.forEach { it.close() } }
}

class SearchViewModel : RustViewModel() {
    private val core = AppCore().managed()   // impossible to forget
}
```

That turns "remember to close" into "wrap once at creation." Leave Lint's
`Recycle` check on for the easy cases; kill the hard cases with the pattern
above.
