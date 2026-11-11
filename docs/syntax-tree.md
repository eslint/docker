# Dockerfile Syntax Tree Format

`@eslint/docker` parses Dockerfile source code into an ESTree-style syntax
tree by wrapping the
[dockerfile-ast](https://www.npmjs.com/package/dockerfile-ast) parser (the
parser behind Docker's official language server) and translating its
output.

## Positions

Every node has three common properties:

```ts
interface DockerNodeBase {
	type: string;
	start: number; // 0-based character offset, inclusive
	end: number; // 0-based character offset, exclusive
}
```

Nodes intentionally do **not** carry `range` or `loc` properties. To get
position information, use the `SourceCode` methods:

```js
const range = sourceCode.getRange(node); // [start, end]
const loc = sourceCode.getLoc(node); // { start: { line, column }, end: ... }
```

Lines and columns are 1-based.

An instruction that uses line continuations (`\`) spans all of its
physical lines. Its argument tokens have the continuations resolved: each
token is a single whitespace-delimited word with offsets pointing at the
physical line it appears on.

## Dockerfile

The root node. `comments` contains every comment in the file in source
order, and `directives` contains parser directives such as
`# syntax=docker/dockerfile:1`; neither is part of the traversed tree.

```ts
interface Dockerfile extends DockerNodeBase {
	type: "Dockerfile";
	body: Instruction[];
	comments: Comment[];
	directives: ParserDirective[];
}

interface Comment extends DockerNodeBase {
	type: "Comment";
	text: string; // text after `#`, trimmed
}

interface ParserDirective extends DockerNodeBase {
	type: "ParserDirective";
	name: string; // e.g. "syntax", "escape"
	value: string;
}
```

Dockerfile comments must begin at the start of a line; a `#` after an
instruction is part of its arguments.

## Instructions

Every instruction node carries its canonical uppercase `keyword`. The
keyword as written (which may be lowercase) occupies
`[start, start + keyword.length)` in the source text.

```ts
interface InstructionBase extends DockerNodeBase {
	keyword: string; // always uppercase: "FROM", "RUN", ...
}
```

### Shared pieces

```ts
interface Argument extends DockerNodeBase {
	type: "Argument";
	value: string;
}

interface Flag extends DockerNodeBase {
	type: "Flag";
	name: string; // without the `--` prefix
	value: string | null; // null when written without `=`
}

interface KeyValuePair extends DockerNodeBase {
	type: "KeyValuePair";
	key: Argument;
	value: Argument | null;
}

interface ShellForm extends DockerNodeBase {
	type: "ShellForm";
	arguments: Argument[]; // whitespace-delimited tokens
}

interface ExecForm extends DockerNodeBase {
	type: "ExecForm";
	elements: Argument[]; // JSON array elements
}
```

`Argument` is used in several positions with slightly different value
semantics:

- **Shell-form tokens** (`RUN echo hi`): `value` is the token exactly as
  written, including any quotes. Tokens are split on whitespace only, so
  `echo "a b"` produces the tokens `echo`, `"a`, and `b"`.
- **Exec-form elements** (`CMD ["a b"]`): `value` is the raw text between
  the double quotes (`a b`), while the offsets include the quotes.
- **Key/value pairs** (`ENV a="b c"`): the pair's `value` argument has
  quotes removed from its string, while the offsets include them.

```dockerfile
FROM node:20
RUN echo hello && echo world
```

### `FROM`

```ts
interface FromInstruction extends InstructionBase {
	type: "FromInstruction";
	keyword: "FROM";
	flags: Flag[]; // e.g. --platform=linux/amd64
	image: ImageReference | null;
	alias: StageName | null; // the name after AS
}

interface ImageReference extends DockerNodeBase {
	type: "ImageReference";
	name: string; // "node", "ghcr.io/org/app", or a stage name
	tag: string | null; // "20-alpine" in node:20-alpine
	digest: string | null; // "sha256:..." in node@sha256:...
}

interface StageName extends DockerNodeBase {
	type: "StageName";
	name: string;
}
```

A `FROM` that references an earlier build stage still produces an
`ImageReference`; its `name` is the stage name.

### `RUN`, `CMD`, `ENTRYPOINT`, and `SHELL`

```ts
interface RunInstruction extends InstructionBase {
	type: "RunInstruction";
	keyword: "RUN";
	flags: Flag[]; // e.g. --mount=type=cache
	command: ShellForm | ExecForm | null;
}

interface CmdInstruction extends InstructionBase {
	type: "CmdInstruction";
	keyword: "CMD";
	command: ShellForm | ExecForm | null;
}

interface EntrypointInstruction extends InstructionBase {
	type: "EntrypointInstruction";
	keyword: "ENTRYPOINT";
	command: ShellForm | ExecForm | null;
}

interface ShellInstruction extends InstructionBase {
	type: "ShellInstruction";
	keyword: "SHELL";
	command: ExecForm | null; // SHELL only accepts the JSON form
}
```

### `COPY` and `ADD`

Both forms (`COPY a b /dest` and `COPY ["a", "b", "/dest"]`) produce the
same shape: the last argument is the destination and the rest are sources.

```ts
interface CopyInstruction extends InstructionBase {
	type: "CopyInstruction";
	keyword: "COPY";
	flags: Flag[]; // e.g. --from=build, --chown=node:node
	sources: Argument[];
	destination: Argument | null;
}

interface AddInstruction extends InstructionBase {
	type: "AddInstruction";
	keyword: "ADD";
	flags: Flag[]; // e.g. --checksum=sha256:...
	sources: Argument[];
	destination: Argument | null;
}
```

### `ENV`, `ARG`, and `LABEL`

All three produce `pairs` of key/value nodes. The legacy space-separated
form `ENV key value` produces one pair whose value spans the rest of the
instruction. A valueless `ARG NAME` has `value: null`.

```ts
interface EnvInstruction extends InstructionBase {
	type: "EnvInstruction";
	keyword: "ENV";
	pairs: KeyValuePair[];
}

interface ArgInstruction extends InstructionBase {
	type: "ArgInstruction";
	keyword: "ARG";
	pairs: KeyValuePair[];
}

interface LabelInstruction extends InstructionBase {
	type: "LabelInstruction";
	keyword: "LABEL";
	pairs: KeyValuePair[];
}
```

### Single-argument instructions

```ts
interface WorkdirInstruction extends InstructionBase {
	type: "WorkdirInstruction";
	keyword: "WORKDIR";
	path: Argument | null;
}

interface UserInstruction extends InstructionBase {
	type: "UserInstruction";
	keyword: "USER";
	user: Argument | null;
}

interface StopsignalInstruction extends InstructionBase {
	type: "StopsignalInstruction";
	keyword: "STOPSIGNAL";
	signal: Argument | null;
}
```

### `EXPOSE` and `VOLUME`

```ts
interface ExposeInstruction extends InstructionBase {
	type: "ExposeInstruction";
	keyword: "EXPOSE";
	ports: Argument[]; // e.g. "8080", "9090/udp"
}

interface VolumeInstruction extends InstructionBase {
	type: "VolumeInstruction";
	keyword: "VOLUME";
	paths: Argument[]; // from either the plain or the JSON form
}
```

### `HEALTHCHECK`

```ts
interface HealthcheckInstruction extends InstructionBase {
	type: "HealthcheckInstruction";
	keyword: "HEALTHCHECK";
	flags: Flag[]; // e.g. --interval=30s
	subcommand: Argument | null; // "CMD" or "NONE"
	arguments: Argument[]; // tokens after the subcommand
}
```

### `ONBUILD`

The trigger is a full nested instruction node starting at its own keyword,
so rules that visit instruction types also see `ONBUILD` triggers.

```ts
interface OnbuildInstruction extends InstructionBase {
	type: "OnbuildInstruction";
	keyword: "ONBUILD";
	trigger: Instruction | null;
}
```

### `MAINTAINER` and unknown instructions

```ts
interface MaintainerInstruction extends InstructionBase {
	type: "MaintainerInstruction";
	keyword: "MAINTAINER";
	arguments: Argument[];
}

interface GenericInstruction extends InstructionBase {
	type: "GenericInstruction";
	keyword: string; // uppercased unknown keyword
	arguments: Argument[];
}
```

## Traversal order

Rules receive nodes in this traversal order (see
`src/visitor-keys.ts`):

| Node type                | Visited children                   |
| ------------------------ | ---------------------------------- |
| `Dockerfile`             | `body`                             |
| `FromInstruction`        | `flags`, `image`, `alias`          |
| `RunInstruction`         | `flags`, `command`                 |
| `CmdInstruction`         | `command`                          |
| `EntrypointInstruction`  | `command`                          |
| `ShellInstruction`       | `command`                          |
| `CopyInstruction`        | `flags`, `sources`, `destination`  |
| `AddInstruction`         | `flags`, `sources`, `destination`  |
| `EnvInstruction`         | `pairs`                            |
| `ArgInstruction`         | `pairs`                            |
| `LabelInstruction`       | `pairs`                            |
| `WorkdirInstruction`     | `path`                             |
| `UserInstruction`        | `user`                             |
| `ExposeInstruction`      | `ports`                            |
| `VolumeInstruction`      | `paths`                            |
| `StopsignalInstruction`  | `signal`                           |
| `HealthcheckInstruction` | `flags`, `subcommand`, `arguments` |
| `OnbuildInstruction`     | `trigger`                          |
| `MaintainerInstruction`  | `arguments`                        |
| `GenericInstruction`     | `arguments`                        |
| `KeyValuePair`           | `key`, `value`                     |
| `ShellForm`              | `arguments`                        |
| `ExecForm`               | `elements`                         |

`Comment`, `ParserDirective`, `Argument`, `Flag`, `ImageReference`, and
`StageName` are leaves. Comments and parser directives are not part of the
traversed tree; access them via `sourceCode.ast.comments` and
`sourceCode.ast.directives`.
