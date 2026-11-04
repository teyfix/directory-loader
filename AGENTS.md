---
title: Directory loader project instructions
summary: Route shared engineering rules and preserve the Bun-native chained directory composition contract.
---

# Directory loader

Read the current shared entrypoint at `/home/dixie/git/teyfix/memory/AGENTS.md` ([canonical main](https://github.com/teyfix/memory/blob/main/AGENTS.md)), then only the relevant topics. Preserve unrelated work when refreshing it.

This repository owns `@teyfix/directory-loader`: a generic chained pipeline for structured files, rather than an i18n runtime. Keep codecs independent of namespace mapping and merging. Bun owns existing native primitives; maintained libraries own CLI parsing and deep merging. Source files use `kebab-case.kind.ts`.

Use the existing Compose Bun service for installation and checks. See [README](README.md) for supported commands and [i18n compatibility](docs/i18n-compatibility.md) before making runtime integration claims. Do not add npm publishing or replace the chained API with a configuration framework.
