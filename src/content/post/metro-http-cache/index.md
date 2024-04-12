---
title: "How To Implement a Metro's Http Cache"
description: "A guide on how to implement Metro's Http Cache in React Native"
publishDate: "2024-04-11"
tags: ["metro", "react-native"]
draft: true
---

More than once I heard about the advantages of Metro's Http cache used inside
Meta, however, I had never seen it implemented outside of Meta. This article
shows you how to do it and the benefits of it.


## What is Metro's Http Cache?

Metro has a caching mechanism to store resolved files. This allows Metro to skip
having to re-resolve, thus re-transform your files if it has done already.

Metro's cache store uses a local cache store by default, typically saved in a
`$TMPDIR/metro-cache` directory.


Besides this local store named FileStore, it also has [other
stores](https://metrobundler.dev/docs/configuration/#cachestores) that you can
use.

The `HttpStore` is a cache store that stores resolved files in a remote server.

The obvious benefit is that you can share the cache between different machines.


## How To Implement


Expand Metro's config with a custom cache store as follow, pointing the
HttpStore to your server:

_I'll use a local server for this example_

```typescript

// metro.config.js Metro Config
const { HttpStore } = require('metro-cache');
  ...
  cacheStores: [
    new HttpStore({
      endpoint: 'http://localhost:8989/metro',
      timeout: 3000,
    }),
  ],
  ...

```



