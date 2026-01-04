---
title: "git merge andrei/cmr-v6 --no-commit --no-ff saves the day"
description: "Using git merge --no-commit --no-ff to stage selective changes across branches"
publishDate: "2025-09-09"
---

Quick git story that might save you some time one day.

I had this long running branch with over 100s of commits. Then I wanted to
partially pick some changes that were scattered across multiple commits.

Sounds like a job for an interactive rebase, right? Well not when you have
changes on different commits with other stuff you don't want to pull.

Then what can I do? well I thought ChatGPT was going to be smart about this but
it kept telling me to do chunk by chunk approaches which were not ideal. Until I
finally understood a process that could work.

I could easily restore or commit chunks of the code if I just put all the
changes into staging. With that insight I found I can do that with any branch by
doing "git merge <any_branch> --no-commit --no-ff".

Bam! pronto. Now I can git restore and git add whatever I want from branch B
into branch A which was exactly what I needed. Plus given that I rely on
fugitive.vim this makes it all breeze.
