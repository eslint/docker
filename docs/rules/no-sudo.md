# no-sudo

Disallow `sudo` in `RUN` instructions.

## Background

`RUN` instructions execute as the current `USER`, which is root by default,
so `sudo` is unnecessary in most Dockerfiles. When the build does run as
a non-root user, `sudo` is still the wrong tool: it is often not
installed, it requires TTY and password configuration that does not exist
in a build environment, and its signal-forwarding behavior causes
surprising failures.

The supported way to change privileges during a build is the `USER`
instruction: switch to root for the instructions that need it, then
switch back.

## Rule Details

This rule warns when a shell-form `RUN` instruction invokes `sudo`,
including inside compound commands joined by `&&`, `||`, `;`, or `|`.

Examples of **incorrect** code for this rule:

```dockerfile
# eslint docker/no-sudo: "error"

FROM ubuntu:24.04
RUN sudo apt-get update
RUN make && sudo make install
```

Examples of **correct** code for this rule:

```dockerfile
# eslint docker/no-sudo: "error"

FROM ubuntu:24.04
RUN apt-get update

USER app
RUN make
USER root
RUN make install
USER app
```

## Options

This rule has no options.

## When Not to Use It

If you build images that intentionally install and configure `sudo` for
use at runtime and your build steps exercise it, you can disable this
rule for those lines with a configuration comment.

## Prior Art

- [hadolint DL3004](https://github.com/hadolint/hadolint/wiki/DL3004)
