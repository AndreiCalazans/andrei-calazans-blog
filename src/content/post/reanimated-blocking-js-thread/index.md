---
title: "Reanimated Can Block Your JS Thread"
description: "A review of a common mistake with Reanimated."
publishDate: "2024-06-18"
tags: ["react-native", "reanimated"]
---

[Reanimated, the React Native animation
library](https://docs.swmansion.com/react-native-reanimated/) allows you to run
animations on the UI thread. This is its main selling point and the reason
behind its performance.

When you run animations on the UI thread they are smoother and more performant
specially when you handle the gestures in that same thread with [React Native Gesture
Handler](https://docs.swmansion.com/react-native-gesture-handler/docs/).

The problem is Reanimated introduces a new concept of ["Worklets"](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/glossary#worklet) and [Shared
Values](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/glossary#shared-value). Developers don't alway know if a value should be a Shared Value or not.
Thus some decide to just use a Shared Value everywhere. This article covers the
consequences of this approach when you need to read the Shared Value from the
JavaScript thread.

## How Did I Get Here?

In an attempt to use
[react-native-collapsible-tab-view](https://github.com/PedroBern/react-native-collapsible-tab-view)
to solve a common UI pattern in one of the apps I work I noticed this
performance issue below:

![FlameGraph](./cpu-profile-of-collapsible-tab-view.png)

The flame graph above shows that the JavaScript thread is blocked by **executeOnUIRuntimeSync**
for quite some time impacting the initial render time of a screen by over 500ms.

## What's Happening?

On closer inspection I noticed the problem was caused by reading a
**SharedValue.value** from the JavaScript thread.

The common patterns I found where:

(1) [Referencing SharedValue.value inside hooks like useEffect.](https://github.com/PedroBern/react-native-collapsible-tab-view/blob/80dcd0ce40d8172e92aae30141dac4046f190644/src/Container.tsx#L316-L320)

```typescript
React.useEffect(() => {
	if (index.value >= tabNamesArray.length) {
		onTabPress(tabNamesArray[tabNamesArray.length - 1]);
	}
}, [index.value, onTabPress, tabNamesArray]);
```

(2) [Referencing a SharedValue.value in a useCallback dependency
array.](https://github.com/PedroBern/react-native-collapsible-tab-view/blob/80dcd0ce40d8172e92aae30141dac4046f190644/src/Container.tsx#L288-L294)

```typescript
const onLayout = React.useCallback(
	(event: LayoutChangeEvent) => {
		const height = event.nativeEvent.layout.height;
		if (containerHeight.value !== height) containerHeight.value = height;
	},
	[containerHeight],
);
```

(3) [Initializing a useState with a
SharedValue.value.](https://github.com/PedroBern/react-native-collapsible-tab-view/blob/80dcd0ce40d8172e92aae30141dac4046f190644/src/hooks.tsx#L589)

```typescript
const [value, setValue] = useState(animatedValue.value);
```

(4) [Initializing a useSharedValue with a
SharedValue.value.](https://github.com/PedroBern/react-native-collapsible-tab-view/blob/80dcd0ce40d8172e92aae30141dac4046f190644/src/Container.tsx#L134-L137)

```typescript
const index: ContextType["index"] = useSharedValue(
	initialTabName ? tabNames.value.findIndex((n) => n === initialTabName) : 0,
);
```

(5) [Reading a SharedValue.value to pass it down as a prop.](https://github.com/PedroBern/react-native-collapsible-tab-view/blob/80dcd0ce40d8172e92aae30141dac4046f190644/src/Container.tsx#L433).

```typescript
<AnimatedPagerView
    ref={containerRef}
    onPageScroll={pageScrollHandler}
    initialPage={index.value}

```

## The Common Pitfall

The common pitfall is deciding if something should be a Shared Value or not. I
believe that you need to ask yourself if the value is going to be an animation driver
or not.

An animation driver is a value that will trigger an animation change. Think Y
position of an element that gets changed by a user dragging it. This value needs
to be a Shared Value since it will trigger style changes in the UI thread via
the **useAnimatedStyle**.

But, if in this same example from above, you need to track the height of the
element for layout purposes, this value does not need to be a Shared Value since
(a) changes to the height are likely mounts and unmounts that won't trigger the
animation and (b) this value is treated almost like a constant value inside your
animation handling logic.

If you do need to read the shared values from the JavaScript thread continuously
or even deriving some value from a Shared Value you could consider holding it in
a state and updating that state with a **useAnimatedReaction** plus **runOnJS**.
Of course, you might need to validate how frequent the updates are to evaluate
the impact of this approach.

```typescript
useAnimatedReaction(
	() => tabNamesArray.length,
	(tabLength) => {
		if (index.value >= tabLength) {
			runOnJS(onTabPress)(tabNamesArray[tabLength - 1]);
		}
	},
);
```
