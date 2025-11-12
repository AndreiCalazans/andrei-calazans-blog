---
title: "How to enable React Native Core's FLog logging on Android"
description: "Quick tip on how to enable React Native Core's FLog logs without building from source"
publishDate: "2025-11-12"
tags: ["react-native", "android"]
---

This week I had to debug a nasty issue with expo-updates where we suspected
something was off with React Native itself.  But to confirm some of our
suspicions we needed to see React Native's internal logs.

If you grep React Native's source code you will see FLog is used in many places
for debugging and warning. By default these logs are disabled. Thus I wanted to
figure out how to enable them without having to build React Native from source.

## How To

Turns we just need to set a logging delegate for FLog and set FLog's minimum
logging level to VERBOSE.

_I did try to just set the minimum logging level but that alone did not work._

In your MainApplication.kt

```kotlin

// need these
import android.util.Log
import com.facebook.common.logging.FLog
import com.facebook.common.logging.LoggingDelegate

class MainApplication : Application(), ReactApplication {

  override fun onCreate() {
    super.onCreate()

    // set this in onCreate to get full logging from React Native internals.
    FLog.setLoggingDelegate(object : LoggingDelegate {
        override fun setMinimumLoggingLevel(level: Int) {
            // Store the minimum level if needed
        }

        override fun getMinimumLoggingLevel(): Int {
            return Log.VERBOSE
        }

        override fun isLoggable(level: Int): Boolean {
            return level >= Log.VERBOSE
        }

        override fun v(tag: String, msg: String) {
            Log.v(tag, msg)
        }

        override fun v(tag: String, msg: String, tr: Throwable) {
            Log.v(tag, msg, tr)
        }

        override fun d(tag: String, msg: String) {
            Log.d(tag, msg)
        }

        override fun d(tag: String, msg: String, tr: Throwable) {
            Log.d(tag, msg, tr)
        }

        override fun i(tag: String, msg: String) {
            Log.i(tag, msg)
        }

        override fun i(tag: String, msg: String, tr: Throwable) {
            Log.i(tag, msg, tr)
        }

        override fun w(tag: String, msg: String) {
            Log.w(tag, msg)
        }

        override fun w(tag: String, msg: String, tr: Throwable) {
            Log.w(tag, msg, tr)
        }

        override fun e(tag: String, msg: String) {
            Log.e(tag, msg)
        }

        override fun e(tag: String, msg: String, tr: Throwable) {
            Log.e(tag, msg, tr)
        }

        override fun wtf(tag: String, msg: String) {
            Log.wtf(tag, msg)
        }

        override fun wtf(tag: String, msg: String, tr: Throwable) {
            Log.wtf(tag, msg, tr)
        }

        override fun log(priority: Int, tag: String, msg: String) {
            Log.println(priority, tag, msg)
        }
    })
    FLog.setMinimumLoggingLevel(FLog.VERBOSE)

  }
}
```
After getting this set up I was able to see React Native's internal logs in
Logcat in our Alpha builds which allowed me to debug why our OTA was broken.
I'll write about that in a separate post.
