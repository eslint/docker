# consistent-instruction-casing

Require instruction keywords to be uppercase.

## Background

Dockerfile instruction keywords are not case-sensitive, so `from`, `From`,
and `FROM` all work. The convention, used throughout the Docker
documentation and enforced by BuildKit's build checks, is to write
keywords in uppercase to distinguish them from their arguments. Mixed
casing within one Dockerfile makes the file harder to scan.

## Rule Details

This rule warns when an instruction keyword is not written entirely in
uppercase. It checks every instruction, including the trigger instruction
of `ONBUILD` and unknown keywords, and it is automatically fixable.

Examples of **incorrect** code for this rule:

```dockerfile
# eslint docker/consistent-instruction-casing: "error"

from node:20-alpine
workdir /app
Copy . .
onbuild run npm ci
```

Examples of **correct** code for this rule:

```dockerfile
# eslint docker/consistent-instruction-casing: "error"

FROM node:20-alpine
WORKDIR /app
COPY . .
ONBUILD RUN npm ci
```

## Options

This rule has no options.

## When Not to Use It

If your project deliberately uses lowercase instruction keywords and you
are consistent about it, you can safely disable this rule.

## Prior Art

- [`ConsistentInstructionCasing`](https://docs.docker.com/reference/build-checks/consistent-instruction-casing/)
  build check
- [`FromAsCasing`](https://docs.docker.com/reference/build-checks/from-as-casing/)
  build check
