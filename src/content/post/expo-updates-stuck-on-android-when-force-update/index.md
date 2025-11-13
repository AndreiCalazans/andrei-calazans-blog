---
title: "UI Freeze Workaround for React Native Expo OTA Updates"
description: "A workaround for the Android UI freeze issue during OTA updates in React Native 0.79.5 when running with the old architecture."
publishDate: "2025-11-13"
tags: ["react-native", "android"]
---

Have you accidentally caught an issue where the React Native Android app froze when doing
a over-the-air update with expo-updates? I have, and here is my story.

We ran into atypical issue with expo-updates (v0.28.17) and React Native (0.79.5) on
Android, where the UI would freeze during OTA updates when using the old
architecture. To overcome this the user had to kill the app and reopen it.

## When was this happening?

This only happened when we call `Updates.reloadAsync()` to reload the app. We do
this to try to speed up the OTA adoption during roll outs.

## What was the issue?

Thankfully, after some investigation and enabling FLog from React Native (see
post on how to do [that here](/posts/react-native-android-enabling-flog)), we
found out why plus a workaround.

In short, when you call `Updates.reloadAsync()` expo-updates calls
`recreateReactContextInBackground()` from React Native which internally calls
unmountApplicationComponentAtRootTag in the old architecture logic path.

unmountApplicationComponentAtRootTag is async since it calls into the JS thread.
However there is some odd race condition that causes it to not properly unmount
the components and the ReactRootView, which leads to the UI freeze.

## Workaround

We were able to workaround this issue by patching RestartReactAppExtensions.kt
from expo-updates to properly detach the ReactRootView, clear the view
hierarchy, and re-attach it after the new React context is ready. This ensures
that the UI is not frozen during the OTA update process.

Patch file for node_modules/expo-updates

```diff
diff --git a/android/src/main/java/expo/modules/updates/procedures/RestartReactAppExtensions.kt b/android/src/main/java/expo/modules/updates/procedures/RestartReactAppExtensions.kt
index 25c6e804d31f9ee915acdf5f363af07e7b7bf424..5e3269c151aa48fbcc417a05c530edbc73c08180 100644
--- a/android/src/main/java/expo/modules/updates/procedures/RestartReactAppExtensions.kt
+++ b/android/src/main/java/expo/modules/updates/procedures/RestartReactAppExtensions.kt
@@ -1,10 +1,19 @@
 package expo.modules.updates.procedures

+import android.util.Log
 import android.app.Activity
+import android.os.Handler
+import android.os.Looper
+import android.view.View
+import com.facebook.react.ReactActivity
 import com.facebook.react.ReactApplication
+import com.facebook.react.ReactInstanceEventListener
+import com.facebook.react.ReactRootView
+import com.facebook.react.bridge.ReactContext
 import com.facebook.react.common.LifecycleState
 import expo.modules.rncompatibility.ReactNativeFeatureFlags

+
 /**
  * An extension for [ReactApplication] to restart the app
  *
@@ -22,5 +31,51 @@ internal fun ReactApplication.restart(activity: Activity?, reason: String) {
     return
   }

+  // Fix for Android UI freeze during OTA updates for the old architecture
+  // on React Native 0.79.5.
+  // We need to properly detach the ReactRootView, recreate the context, and re-attach
+  if (activity is ReactActivity) {
+    try {
+      val reactDelegate = activity.reactDelegate
+      val reactRootView = reactDelegate?.reactRootView
+
+      if (reactRootView != null) {
+        val reactInstanceManager = reactNativeHost.reactInstanceManager
+
+        // 1. Unmount the root view to stop JS from rendering
+        reactInstanceManager.detachRootView(reactRootView)
+
+        // 2. Clear the view hierarchy and ID
+        reactRootView.removeAllViews()
+        reactRootView.id = View.NO_ID
+
+        // 3. Add a one-time listener to re-attach the view after the new context is ready
+        val listener = object : ReactInstanceEventListener {
+          override fun onReactContextInitialized(context: ReactContext) {
+            Handler(Looper.getMainLooper()).post {
+              // Re-attach the root view to the new React instance
+              reactInstanceManager.attachRootView(reactRootView)
+
+              // Remove this one-time listener
+              reactInstanceManager.removeReactInstanceEventListener(this)
+            }
+          }
+        }
+        reactInstanceManager.addReactInstanceEventListener(listener)
+
+        // 4. Post to UI thread with delay to ensure cleanup completes
+        Handler(Looper.getMainLooper()).postDelayed({
+          // Now recreate the React context - the listener will re-attach the view
+          reactInstanceManager.recreateReactContextInBackground()
+        }, 100)
+
+        return
+      }
+    } catch (e: Exception) {
+      // If cleanup fails, try the standard approach as fallback
+    }
+  }
+
+  // Fallback: standard recreation without cleanup
   reactNativeHost.reactInstanceManager.recreateReactContextInBackground()
 }
```

## New Architecture

Fortunately this issue does not happen in the new architecture, so we won't need
to maintain this patch long term.
