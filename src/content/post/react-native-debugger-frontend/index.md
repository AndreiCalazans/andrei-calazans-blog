---
title: "Did You Know You Can Use Latest React Native DevTools Without Upgrading?"
description: "A little to trick to allow you to get access to the latest React Native DevTools"
publishDate: "2025-12-15"
tags: ["react-native"]
---

It takes effort to stay on latest React Native version and if you are like me
[the recent improvements to the React Native DevTools](https://reactnative.dev/blog/2025/12/10/react-native-0.83#new-devtools-features)
has left you envied.

Well wait no longer, I found out a way to use latest DevTools without needing to
upgrade React Native.

## Forcing Resolution

Ever since version 0.73 the React Native Core team split out the logic related
to the DevTools [as its own package](https://github.com/facebook/react-native/tree/0.73-stable/packages/debugger-frontend). Great job by the way!

The split out package is very well contained and has worked well with
different versions of React Native. Therefore you can be on version 0.79 and still use
the debugger from version 0.83 by forcing resolution.

In your package.json file force resolution for _@react-native/dev-middleware_
and _@react-native/debugger-frontend_:
```json
{
  "resolutions": {
    "@react-native/dev-middleware": "0.83.0",
    "@react-native/debugger-frontend": "0.83.0"
    },
  "resolutionComments": {
    "@react-native/dev-middleware": "Forcing resolution to use latest Chrome DevTools.",
    "@react-native/debugger-frontend": "Forcing resolution to use latest Chrome DevTools."
  }
}
```

## Expo

On Expo you want to set the env variable _REACT_NATIVE_DEBUGGER_FRONTEND_PATH_
to point to _node_modules/@react-native/debugger-frontend/dist/third-party/front_end/_.

If this is correct you will see _expo start_ log the following message:

```cli
Using custom debugger frontend path from process.env.REACT_NATIVE_DEBUGGER_FRONTEND_PATH: ../../../node_modules/@react-native/debugger-frontend/dist/third-party/front_end/
```

That's it. Enjoy the more stable React Native DevTools!

## Is It Stable? (UPDATE)

No, [we have been warned by Alex Hunt](https://x.com/huntie/status/2000865780540248299) that this is likely to break between React
Native versions that received updates to the internal C++ backend code that
integrates/implements the Chrome Debugger Protocol. They might eventually add a
version constraint check.

