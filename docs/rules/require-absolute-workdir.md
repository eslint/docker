# require-absolute-workdir

Require `WORKDIR` paths to be absolute.

## Background

A relative `WORKDIR` is resolved against the previous `WORKDIR`, so its
meaning depends on everything that came before it — including `WORKDIR`
instructions inherited from the base image:

```dockerfile
# a base image whose WORKDIR might be anything
FROM some-base
# …/app, wherever that is
WORKDIR app
```

If the base image changes its working directory, the build breaks or,
worse, silently writes files to the wrong place. An absolute path always
means the same thing.

## Rule Details

This rule warns when a `WORKDIR` path is not absolute. Unix paths starting
with `/`, Windows paths starting with a drive letter (`C:/`), and paths
starting with a variable reference (`$`, `${...}`, or `%...%`) are
accepted; variable values cannot be checked statically.

Examples of **incorrect** code for this rule:

```dockerfile
# eslint docker/require-absolute-workdir: "error"

FROM node:20
WORKDIR app
WORKDIR ./app
WORKDIR usr/src/app
```

Examples of **correct** code for this rule:

```dockerfile
# eslint docker/require-absolute-workdir: "error"

FROM node:20
WORKDIR /usr/src/app
WORKDIR $APP_HOME
WORKDIR C:/app
```

## Options

This rule has no options.

## When Not to Use It

If you deliberately use relative `WORKDIR` instructions to build paths in
steps (`WORKDIR /app` followed by `WORKDIR src`), you can disable this
rule, though writing the full path in each `WORKDIR` is clearer.

## Prior Art

- [hadolint DL3000](https://github.com/hadolint/hadolint/wiki/DL3000)
- [`WorkdirRelativePath`](https://docs.docker.com/reference/build-checks/workdir-relative-path/)
  build check
