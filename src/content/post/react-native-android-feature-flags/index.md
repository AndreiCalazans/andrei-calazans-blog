---
title: "How to set React Native Core's feature flags on Android"
description: "Quick tip on how to set React Native Core's feature flag without building from source"
publishDate: "2025-04-11"
tags: ["react-native", "android"]
---

So perhaps you are like me, trying to figure out why the hell something is
broken with React Native's Fabric renderer but not with the old archicture. And
you think if I could only get some logs?

Well, there is a feature flag for that
called `enableFabricLogs` but how can I set that flag without having to build
React Native from source?


## How To
In your MainApplication.kt

```kotlin
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsDefaults
...

...
// inside initialize at the end
ReactNativeFeatureFlags.override(object : ReactNativeFeatureFlagsDefaults() {
  override fun enableFabricLogs(): Boolean = true
})

```

You can view all the default features flags on [Android here](https://github.com/facebook/react-native/blob/c50f3e5f668887bfb0c7080155c066a4fdcc092c/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlagsDefaults.kt#L22).


What about iOS? I don't care about iOS, it's never as broken as Android ; )
