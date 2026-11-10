# no-maintainer

Disallow the deprecated MAINTAINER instruction.

## Background

The MAINTAINER instruction was deprecated in Docker 1.13 (2017). It was a
special-purpose instruction that set a single metadata field, and it has
been replaced by the general-purpose LABEL instruction:

```dockerfile
LABEL maintainer="jane@example.com"
```

Labels are visible with `docker inspect`, can be filtered on, and can
express any metadata, so there is no reason to keep using MAINTAINER.

## Rule Details

This rule warns on every MAINTAINER instruction. When the value is a
simple single-line string without quotes or backslashes, the rule fixes
the instruction by rewriting it as a `maintainer` LABEL.

Examples of **incorrect** code for this rule:

```dockerfile
# eslint docker/no-maintainer: "error"

FROM node:20
MAINTAINER Jane Doe <jane@example.com>
```

Examples of **correct** code for this rule:

```dockerfile
# eslint docker/no-maintainer: "error"

FROM node:20
LABEL maintainer="Jane Doe <jane@example.com>"
```

## Options

This rule has no options.

## When Not to Use It

MAINTAINER has been deprecated for years and LABEL is a drop-in
replacement, so this rule should always be enabled.

## Prior Art

- [hadolint DL4000](https://github.com/hadolint/hadolint/wiki/DL4000)
- [`MaintainerDeprecated`](https://docs.docker.com/reference/build-checks/maintainer-deprecated/)
  build check
