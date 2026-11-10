# require-image-tag

Require base images to be pinned to an explicit tag or digest.

## Background

A FROM instruction without a tag implicitly uses `latest`, and `latest`
itself is a moving target: the image it points to changes whenever the
publisher pushes a new version. Builds that worked yesterday can fail
today, and two machines building the same Dockerfile can produce
different images with different behavior and different vulnerabilities.

Pinning to a specific tag (`node:20-alpine`) makes builds predictable;
pinning to a digest (`node@sha256:...`) makes them fully reproducible.

## Rule Details

This rule warns when a FROM image has no tag or digest (`missingTag`) or
uses the `latest` tag (`latestTag`). It does not warn for:

- references to earlier build stages (`FROM base`),
- the reserved `scratch` image, which has no tags,
- images pinned by digest, and
- image names containing variable references, which cannot be checked.

Examples of **incorrect** code for this rule:

```dockerfile
# eslint docker/require-image-tag: "error"

FROM node
FROM ubuntu:latest
```

Examples of **correct** code for this rule:

```dockerfile
# eslint docker/require-image-tag: "error"

FROM node:20-alpine AS build
FROM alpine@sha256:c5b1261d6d3e43071626931fc004f70149baeba2c8ec672bd4f27761f8e1ad6b
FROM scratch
FROM $BASE_IMAGE
FROM build
```

## Options

This rule has no options.

## When Not to Use It

In throwaway or experimental Dockerfiles where you always want the
newest image and don't care about reproducibility, you can disable this
rule.

## Prior Art

- [hadolint DL3006](https://github.com/hadolint/hadolint/wiki/DL3006)
- [hadolint DL3007](https://github.com/hadolint/hadolint/wiki/DL3007)
