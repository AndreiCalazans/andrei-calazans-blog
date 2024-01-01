---
title: "You should be using rtx"
description: "rtx - A version manager for multiple languages like ASDF, has great developer experience and is not yet an industry standard."
publishDate: "2023-12-30"
tags: ["tooling", "devops", "node", "java", "ruby", "python"]
---

I think [rtx](https://github.com/jdx/rtx) nails the developer experience with
managing runtime versions and you likely have not heard of it yet.

This screenshot alone has a few strong reasons why you should be using rtx:

![RTX version manager in action managing Node.js](./rtx-in-action.png "RTX in action managing Node.js versions")

1. With Node, rtx interops already with .nvmrc files.
2. You don't have to preinstall Node, when you switch into a project that has a different Node version and you run a Node command rtx will do the job of installing that version for you.
3. Switching out of the directory will change the version back to your default.
4. It's super fast. Nvm would not have taken 7 seconds to install Node 18.19.0
5. All of the above is true for a very large list of packages which include Ruby, Java, Python, Bun, Deno, and Go. See full list [here](https://github.com/rtx-plugins/registry).

Now if you like me, working with React Native and needing to manage runtime dependencies for Java, Node, Python, and Ruby. rtx is exactly what we want.

And that's not it, the author of rtx, Jeff Dickey ([@jdxcode](https://twitter.com/jdxcode)), wrote about [10 other features](https://jdx.dev/posts/2023-04-08-10-rtx-features/) we missed which includes [task runners](https://github.com/jdx/rtx/discussions/1264) and _direnv_ like functionality to load and unload env variables per directory.

Oh did I also mention it's written in Rust? so it is Blazingly Fast 😍

Edit 01/01/2024: [Jeff Dickey mentioned](https://twitter.com/jdxcode/status/1741578965717033215) they support a pretty large list of
packages.
