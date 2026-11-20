# no-apt-get-upgrade

Disallow `apt-get upgrade` in `RUN` instructions.

## Background

Running `apt-get upgrade` (or `apt upgrade`, `dist-upgrade`, or
`full-upgrade`) inside a Dockerfile upgrades whatever packages happen to
have updates available at build time. That makes builds unreproducible:
the same Dockerfile produces different images on different days, and the
resulting package versions are recorded nowhere. It also bloats the image
with package cache layers.

If the base image is missing security fixes, the right response is to use
a newer base image. Tags such as `ubuntu:24.04` can point to a different
image over time, so pin the base image by digest
(`ubuntu:24.04@sha256:...`) when you need reproducible builds; other
unpinned inputs, such as packages installed without a version, can still
change between builds.

## Rule Details

This rule warns when a shell-form `RUN` instruction runs `apt-get` or `apt`
with the `upgrade`, `dist-upgrade`, or `full-upgrade` subcommand,
including inside compound commands joined by `&&`, `||`, `;`, or `|`.

The rule splits compound commands only at operators written as separate
words (`a && b`) or at a `;` that ends a word (`a; b`). An operator
attached to a neighboring word, as in `echo ok&& apt-get upgrade`, does not
start a new command, so an upgrade after it is not reported.

Leading variable assignments such as
`DEBIAN_FRONTEND=noninteractive apt-get upgrade` are skipped, but commands
run through another program, such as `env apt-get upgrade`,
`xargs apt-get upgrade`, or `sudo apt-get upgrade`, are not reported.

Examples of **incorrect** code for this rule:

```dockerfile
# eslint docker/no-apt-get-upgrade: "error"

FROM ubuntu:24.04
RUN apt-get upgrade -y
RUN apt-get update && apt-get -y dist-upgrade
RUN apt full-upgrade -y
```

Examples of **correct** code for this rule:

```dockerfile
# eslint docker/no-apt-get-upgrade: "error"

FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends git
```

## Options

This rule has no options.

## When Not to Use It

If you intentionally upgrade packages at build time — for example, in an
image that is rebuilt on a schedule specifically to pick up security
updates — you can disable this rule.

## Prior Art

- [hadolint DL3005](https://github.com/hadolint/hadolint/wiki/DL3005)
