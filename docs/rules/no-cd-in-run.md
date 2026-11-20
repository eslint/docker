# no-cd-in-run

Disallow `cd` in `RUN` instructions in favor of `WORKDIR`.

## Background

Each `RUN` instruction starts a fresh shell, so a directory change made
with `cd` does not persist to the next instruction:

```dockerfile
RUN cd /app
# runs in /, not /app!
RUN npm ci
```

Even within a single `RUN`, using `cd` hides the working directory from
the rest of the Dockerfile. The `WORKDIR` instruction sets the directory
declaratively, persists across instructions, and applies to `CMD` and
`ENTRYPOINT` as well.

## Rule Details

This rule warns when a shell-form `RUN` instruction uses `cd` as a command,
including inside compound commands joined by `&&`, `||`, `;`, or `|`.

When a `RUN` instruction consists of nothing but a single `cd` to an
absolute path (which does nothing at all), the rule suggests replacing the
instruction with `WORKDIR`. This is a suggestion rather than an automatic
fix because `WORKDIR` also changes the directory of every later
instruction and creates the directory if it does not exist, so review the
rest of the stage before applying it. Relative paths, `cd -`, and `cd`
options are reported without a suggestion because `cd` resolves them
differently from `WORKDIR`. Compound commands are reported without a
suggestion because the correct rewrite depends on the surrounding commands.

Examples of **incorrect** code for this rule:

```dockerfile
# eslint docker/no-cd-in-run: "error"

FROM node:20
RUN cd /app
RUN cd /app && npm ci
RUN make && cd /out; tar czf /dist.tar.gz .
```

Examples of **correct** code for this rule:

```dockerfile
# eslint docker/no-cd-in-run: "error"

FROM node:20
WORKDIR /app
RUN npm ci
```

## Options

This rule has no options.

## When Not to Use It

If a `RUN` instruction genuinely needs to visit several directories in one
shell — and a `--mount` or subshell layout would be more awkward — you can
disable this rule for that line with a configuration comment.

## Prior Art

- [hadolint DL3003](https://github.com/hadolint/hadolint/wiki/DL3003)
