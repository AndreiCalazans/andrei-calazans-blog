---
title: "Migrating a React Native's Native Module to Turbo Module on Android"
description: "How to migrate a React Native's Native Module to Turbo Module on Android"
publishDate: "2025-08-06"
tags: ["android", "react-native", "turbo-module", "native-module"]
---

In the [previous post](/posts/bridging-trace-on-android/) on bridging the Trace
API on Android I noticed how ChatGPT generated the native module using the
legacy Native Module. So I had to manually migrate it to Turbo Module. This post
is how to accomplish such migration.

## 🧾 Before: Legacy Native Module

The original TracingModule looked like this in Kotlin:

```kotlin
// TracingModule.kt
class TracingModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "TracingModule"

    @ReactMethod
    fun beginSection(sectionName: String) {
        Trace.beginSection(sectionName)
    }

    @ReactMethod
    fun endSection() {
        Trace.endSection()
    }
}
```

It was registered using the old ReactPackage interface:

```kotlin
// TracingPackage.kt
class TracingPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(TracingModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
```

And used like this from JavaScript:

```typescript
import { NativeModules } from 'react-native';

NativeModules.TracingModule.beginSection('MySection');
```

## 🧬 After: Turbo Module

## ✅ 1. Replace Legacy Module with TurboModule Implementation

```kotlin
// TracingModuleSpec.kt
@ReactModule(name = TracingModule.NAME)
class TracingModule(reactContext: ReactApplicationContext)
  : ReactContextBaseJavaModule(reactContext), TurboModule {

    companion object {
        const val NAME = "TracingModule"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun beginSection(sectionName: String) {
        android.os.Trace.beginSection(sectionName)
    }

    @ReactMethod
    fun endSection() {
        android.os.Trace.endSection()
    }
}
```

Key additions:

- Annotated with @ReactModule
- Implements TurboModule interface

## ✅ 2. Update Package to Use TurboReactPackage

```kotlin
class TracingPackage : TurboReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == TracingModule.NAME) TracingModule(reactContext) else null
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                TracingModule.NAME to ReactModuleInfo(
                    TracingModule.NAME,
                    TracingModule.NAME,
                    false, // canOverrideExistingModule
                    false, // needsEagerInit
                    true,  // hasConstants
                    true,  // isCxxModule
                    true   // isTurboModule
                )
            )
        }
    }
}
```

## ✅ 3. Define the TypeScript Spec for the Module

```kotlin
// specs/NativeTracingModule.ts
import { TurboModule, TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  beginSection(name: string): void;
  endSection(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('TracingModule');
```


This gives TypeScript type safety and integrates with the TurboModule codegen system.

## ✅ 4. Add codegenConfig to package.json

```json
"codegenConfig": {
  "name": "NativeTracingModuleSpec",
  "type": "modules",
  "jsSrcsDir": "specs",
  "android": {
    "javaPackageName": "com.myrnapp"
  }
}

```
This tells the Metro bundler and codegen how to build the binding between your JS spec and native module.


## ✅ 5. Run Codegen


To generate the necessary artifacts for the TurboModule, run the following
command in the android folder:

```shell
./gradlew generateCodegenArtifactsFromSchema
```


## ✅ 6. Update JS Usage

Instead of accessing the module via NativeModules, you now import the strongly-typed TurboModule:

```typescript
import TracingModule from './specs/NativeTracingModule';

TracingModule.beginSection('MySection');
```

## ⚠️ Gotchas

- Make sure the module name in the spec matches getName() exactly.
- This currently an Android only module.



I'll soon review how we can trace similarly on iOS.
