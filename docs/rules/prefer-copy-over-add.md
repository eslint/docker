# prefer-copy-over-add

Require `COPY` instead of `ADD` for local files and directories.

## Background

`COPY` and `ADD` both copy files into the image, but `ADD` has two extra
behaviors: it can download remote URLs, and it automatically extracts
recognized archive formats. Those behaviors are implicit — a reader
cannot tell from `ADD app.tar.gz /opt/` whether the archive ends up
extracted or copied without knowing `ADD`'s rules — and they have been the
source of security issues with attacker-controlled archives.

The Docker documentation recommends `COPY` for the common case of copying
local files, reserving `ADD` for the cases that actually need it.

## Rule Details

This rule warns when an `ADD` instruction copies local, non-archive
sources, and fixes it by replacing `ADD` with `COPY`. The rule does not warn
when `ADD`'s extra behavior may be intended:

- a source is a remote URL (`https://...`) or a Git reference (`git@...`),
- a source looks like an archive (`.tar`, `.tar.gz`, `.tgz`, `.tar.bz2`,
  `.tar.xz`, `.tar.zst`, and similar),
- the instruction uses an ADD-only flag (`--checksum`, `--keep-git-dir`,
  or `--unpack`), or
- a source contains a variable reference, a wildcard, quotes, or escapes,
  which cannot be checked.

Examples of **incorrect** code for this rule:

```dockerfile
# eslint docker/prefer-copy-over-add: "error"

FROM node:20
ADD src/ /app/src/
ADD --chown=node:node package.json /app/
```

Examples of **correct** code for this rule:

```dockerfile
# eslint docker/prefer-copy-over-add: "error"

FROM node:20
COPY src/ /app/src/
ADD https://example.com/release.tar.gz /tmp/
ADD rootfs.tar.gz /
ADD --checksum=sha256:24454f830c... files/ /app/
```

## Options

This rule has no options.

## When Not to Use It

If you rely on `ADD` behavior this rule cannot detect — for example,
extracting an archive whose name has no recognizable extension — disable
the rule for that line with a configuration comment.

## Prior Art

- [hadolint DL3020](https://github.com/hadolint/hadolint/wiki/DL3020)
- [Dockerfile best practices: `ADD` or `COPY`](https://docs.docker.com/build/building/best-practices/#add-or-copy)
