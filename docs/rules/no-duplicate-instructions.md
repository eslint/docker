# no-duplicate-instructions

Disallow multiple `CMD`, `ENTRYPOINT`, or `HEALTHCHECK` instructions in the same stage.

## Background

Docker only honors the last `CMD`, `ENTRYPOINT`, and `HEALTHCHECK` instruction
in each build stage. Earlier occurrences are silently ignored:

```dockerfile
FROM node:20
CMD ["node", "server.js"]
# only this one takes effect
CMD ["node", "worker.js"]
```

A duplicate is almost always a mistake — usually a leftover from an edit
or a misunderstanding of how these instructions combine.

## Rule Details

This rule warns on every `CMD`, `ENTRYPOINT`, and `HEALTHCHECK` instruction
that is followed by another instruction with the same keyword in the same
build stage. The last occurrence — the one Docker actually uses — is not
reported. Stages in a multi-stage build are checked independently.

Examples of **incorrect** code for this rule:

```dockerfile
# eslint docker/no-duplicate-instructions: "error"

FROM node:20
ENTRYPOINT ["node"]
CMD ["server.js"]
CMD ["worker.js"]
```

Examples of **correct** code for this rule:

```dockerfile
# eslint docker/no-duplicate-instructions: "error"

FROM node:20 AS build
CMD ["node", "build.js"]

FROM node:20
ENTRYPOINT ["node"]
CMD ["server.js"]
```

## Options

This rule has no options.

## When Not to Use It

There is no valid reason to have duplicate `CMD`, `ENTRYPOINT`, or
`HEALTHCHECK` instructions in one stage, so this rule should always be
enabled.

## Prior Art

- [hadolint DL4003](https://github.com/hadolint/hadolint/wiki/DL4003)
- [hadolint DL4004](https://github.com/hadolint/hadolint/wiki/DL4004)
