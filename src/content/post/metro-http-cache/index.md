---
title: "How To Implement Metro's Http Cache"
description: "A guide on how to implement Metro's Http Cache in React Native"
publishDate: "2024-04-13"
tags: ["metro", "react-native"]
---

More than once I heard about the advantages of Metro's Http cache used inside
Meta, however, I had never seen it implemented outside of Meta. This article
shows you how to do it and the benefits of it.

## What is Metro's Http Cache?

Metro has a caching mechanism to store resolved files, allowing it to skip transforming
files that have already been processed.

By default, Metro uses a local cache store, typically located in the
`$TMPDIR/metro-cache` directory.

Besides this local store named FileStore, it also has [other
stores](https://metrobundler.dev/docs/configuration/#cachestores) that you can
use.

The `HttpStore` is a type of cache store that saves resolved files on a remote server.

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

The above `HttpStore` will make requests to the server at `http://localhost:8989/metro` with GET and PUT requests for `/:key`
path. The server then handles these requests, storing and retrieving compressed data based on a key. Metro's HttpStore expects compressed data.

See a simple implementation of this server in Node.js:

```javascript
const express = require("express");
const zlib = require("zlib");
const fs = require("fs");
const http = require("http");

const endpoint = "/metro";
const app = express();
const router = express.Router();

app.use(endpoint, router);

router.get("/", (_, res) => {
	res.send("Hello World!");
});

router.get("/:key", (req, res) => {
	const key = req.params.key;
	console.log("get?", key);
	try {
		const data = fs.readFileSync(`./cache/${key}`);
		const compressed = zlib.gzipSync(data);
		res.send(compressed);
	} catch (e) {
		res.status(404).send({ error: "not found" });
	}
});

router.put("/:key", (req, res) => {
	let chunks = [];
	req.on("data", (chunk) => chunks.push(chunk));
	req.on("end", () => {
		try {
			const key = req.params.key;
			console.log("put?", key);
			// Read compressed data
			const compressedData = Buffer.concat(chunks);
            // Decompresses data
			const data = zlib.gunzipSync(compressedData);
			fs.writeFileSync(`./cache/${key}`, data);
			res.send({ status: "ok" });
		} catch (err) {
			console.log(err);
			res.status(500).send({ status: "error", message: err.message });
		}
	});
});

const server = http.createServer(app);
server.timeout = 5000;
server.listen(8989, () => console.log("HTTP Server running on port 8989"));
```

## The Benefits?

On a fast M2 Macbook Pro 2023, this improved first Metro load time by 54%.
Without the Http cache, it took Metro 1 minute and 14 seconds to resolve all the
files in a fairly large project. With the Http cache, it took 48 seconds.

The benefits are even more noticeable on slower machines.
