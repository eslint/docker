/**
 * @fileoverview Type definitions for the Dockerfile ESTree-style syntax tree
 * and for rules operating on it. See docs/syntax-tree.md for the full
 * documentation of the tree format.
 * @author Claude Fable 5
 */

import type {
	CustomRuleDefinitionType,
	CustomRuleTypeDefinitions,
	CustomRuleVisitorWithExit,
} from "@eslint/plugin-kit";
import type { DockerSourceCode } from "./languages/docker-source-code.js";

//------------------------------------------------------------------------------
// Base
//------------------------------------------------------------------------------

/**
 * Every node carries `start` and `end` character offsets into the source
 * text (0-based, `end` exclusive). Nodes deliberately do not carry `range`
 * or `loc` properties; use `sourceCode.getRange(node)` and
 * `sourceCode.getLoc(node)` instead.
 */
export interface DockerNodeBase {
	type: string;
	start: number;
	end: number;
}

/**
 * Properties shared by every instruction node. `keyword` is always the
 * canonical uppercase form; the keyword as written occupies
 * `[start, start + keyword.length)` in the source text.
 */
export interface InstructionBase extends DockerNodeBase {
	keyword: string;
}

//------------------------------------------------------------------------------
// Root
//------------------------------------------------------------------------------

export interface DockerfileNode extends DockerNodeBase {
	type: "Dockerfile";
	body: InstructionNode[];
	comments: CommentNode[];
	directives: ParserDirectiveNode[];
}

export interface CommentNode extends DockerNodeBase {
	type: "Comment";

	/** The comment text without the leading `#`, trimmed. */
	text: string;
}

/**
 * A parser directive such as `# syntax=docker/dockerfile:1` or
 * `# escape=\``. Directives may only appear before the first instruction
 * and are not part of the traversed tree.
 */
export interface ParserDirectiveNode extends DockerNodeBase {
	type: "ParserDirective";
	name: string;
	value: string;
}

//------------------------------------------------------------------------------
// Shared pieces
//------------------------------------------------------------------------------

/**
 * A whitespace-delimited token. For arguments derived from a JSON (exec
 * form) array, `value` is the parsed string content while the offsets
 * still include the enclosing double quotes.
 */
export interface ArgumentNode extends DockerNodeBase {
	type: "Argument";
	value: string;
}

/**
 * An instruction option such as `--platform=linux/amd64` or
 * `--chown=node:node`. `name` excludes the `--` prefix; `value` is `null`
 * when the flag has no `=`.
 */
export interface FlagNode extends DockerNodeBase {
	type: "Flag";
	name: string;
	value: string | null;
}

/**
 * A `name=value` pair used by ENV, LABEL, and ARG. `value` is `null` for
 * valueless ARG declarations. The value string has surrounding quotes
 * removed while the node offsets still include them.
 */
export interface KeyValuePairNode extends DockerNodeBase {
	type: "KeyValuePair";
	key: ArgumentNode;
	value: ArgumentNode | null;
}

/** The base image reference of a FROM instruction. */
export interface ImageReferenceNode extends DockerNodeBase {
	type: "ImageReference";

	/** The image name, including any registry prefix. */
	name: string;

	/** The tag after `:`, or `null` when not specified. */
	tag: string | null;

	/** The digest after `@`, or `null` when not specified. */
	digest: string | null;
}

/** The stage name after `AS` in a FROM instruction. */
export interface StageNameNode extends DockerNodeBase {
	type: "StageName";
	name: string;
}

/**
 * A shell-form command (`RUN apt-get update`). `arguments` holds the
 * whitespace-delimited tokens with line continuations already resolved.
 */
export interface ShellFormNode extends DockerNodeBase {
	type: "ShellForm";
	arguments: ArgumentNode[];
}

/**
 * An exec-form (JSON array) command (`CMD ["node", "app.js"]`). Each
 * element's `value` is the parsed string content.
 */
export interface ExecFormNode extends DockerNodeBase {
	type: "ExecForm";
	elements: ArgumentNode[];
}

export type CommandBodyNode = ShellFormNode | ExecFormNode;

//------------------------------------------------------------------------------
// Instructions
//------------------------------------------------------------------------------

export interface FromInstructionNode extends InstructionBase {
	type: "FromInstruction";
	keyword: "FROM";
	flags: FlagNode[];
	image: ImageReferenceNode | null;
	alias: StageNameNode | null;
}

export interface RunInstructionNode extends InstructionBase {
	type: "RunInstruction";
	keyword: "RUN";
	flags: FlagNode[];
	command: CommandBodyNode | null;
}

export interface CmdInstructionNode extends InstructionBase {
	type: "CmdInstruction";
	keyword: "CMD";
	command: CommandBodyNode | null;
}

export interface EntrypointInstructionNode extends InstructionBase {
	type: "EntrypointInstruction";
	keyword: "ENTRYPOINT";
	command: CommandBodyNode | null;
}

export interface ShellInstructionNode extends InstructionBase {
	type: "ShellInstruction";
	keyword: "SHELL";
	command: ExecFormNode | null;
}

export interface CopyInstructionNode extends InstructionBase {
	type: "CopyInstruction";
	keyword: "COPY";
	flags: FlagNode[];
	sources: ArgumentNode[];
	destination: ArgumentNode | null;
}

export interface AddInstructionNode extends InstructionBase {
	type: "AddInstruction";
	keyword: "ADD";
	flags: FlagNode[];
	sources: ArgumentNode[];
	destination: ArgumentNode | null;
}

export interface EnvInstructionNode extends InstructionBase {
	type: "EnvInstruction";
	keyword: "ENV";
	pairs: KeyValuePairNode[];
}

export interface ArgInstructionNode extends InstructionBase {
	type: "ArgInstruction";
	keyword: "ARG";
	pairs: KeyValuePairNode[];
}

export interface LabelInstructionNode extends InstructionBase {
	type: "LabelInstruction";
	keyword: "LABEL";
	pairs: KeyValuePairNode[];
}

export interface WorkdirInstructionNode extends InstructionBase {
	type: "WorkdirInstruction";
	keyword: "WORKDIR";
	path: ArgumentNode | null;
}

export interface UserInstructionNode extends InstructionBase {
	type: "UserInstruction";
	keyword: "USER";
	user: ArgumentNode | null;
}

export interface ExposeInstructionNode extends InstructionBase {
	type: "ExposeInstruction";
	keyword: "EXPOSE";
	ports: ArgumentNode[];
}

export interface VolumeInstructionNode extends InstructionBase {
	type: "VolumeInstruction";
	keyword: "VOLUME";
	paths: ArgumentNode[];
}

export interface StopsignalInstructionNode extends InstructionBase {
	type: "StopsignalInstruction";
	keyword: "STOPSIGNAL";
	signal: ArgumentNode | null;
}

export interface HealthcheckInstructionNode extends InstructionBase {
	type: "HealthcheckInstruction";
	keyword: "HEALTHCHECK";
	flags: FlagNode[];

	/** The `CMD` or `NONE` argument, or `null` when missing. */
	subcommand: ArgumentNode | null;

	/** The tokens after the subcommand. */
	arguments: ArgumentNode[];
}

export interface OnbuildInstructionNode extends InstructionBase {
	type: "OnbuildInstruction";
	keyword: "ONBUILD";
	trigger: InstructionNode | null;
}

export interface MaintainerInstructionNode extends InstructionBase {
	type: "MaintainerInstruction";
	keyword: "MAINTAINER";
	arguments: ArgumentNode[];
}

/** Any instruction with a keyword this plugin does not model. */
export interface GenericInstructionNode extends InstructionBase {
	type: "GenericInstruction";
	arguments: ArgumentNode[];
}

export type InstructionNode =
	| FromInstructionNode
	| RunInstructionNode
	| CmdInstructionNode
	| EntrypointInstructionNode
	| ShellInstructionNode
	| CopyInstructionNode
	| AddInstructionNode
	| EnvInstructionNode
	| ArgInstructionNode
	| LabelInstructionNode
	| WorkdirInstructionNode
	| UserInstructionNode
	| ExposeInstructionNode
	| VolumeInstructionNode
	| StopsignalInstructionNode
	| HealthcheckInstructionNode
	| OnbuildInstructionNode
	| MaintainerInstructionNode
	| GenericInstructionNode;

/** The node types of every instruction node. */
export const INSTRUCTION_TYPES = [
	"FromInstruction",
	"RunInstruction",
	"CmdInstruction",
	"EntrypointInstruction",
	"ShellInstruction",
	"CopyInstruction",
	"AddInstruction",
	"EnvInstruction",
	"ArgInstruction",
	"LabelInstruction",
	"WorkdirInstruction",
	"UserInstruction",
	"ExposeInstruction",
	"VolumeInstruction",
	"StopsignalInstruction",
	"HealthcheckInstruction",
	"OnbuildInstruction",
	"MaintainerInstruction",
	"GenericInstruction",
] as const;

//------------------------------------------------------------------------------
// Union of all nodes
//------------------------------------------------------------------------------

export type DockerNode =
	| DockerfileNode
	| CommentNode
	| ParserDirectiveNode
	| InstructionNode
	| ArgumentNode
	| FlagNode
	| KeyValuePairNode
	| ImageReferenceNode
	| StageNameNode
	| ShellFormNode
	| ExecFormNode;

//------------------------------------------------------------------------------
// Language options
//------------------------------------------------------------------------------

export interface DockerLanguageOptions {
	[key: string]: unknown;
}

//------------------------------------------------------------------------------
// Rules
//------------------------------------------------------------------------------

/**
 * Visitor object for Dockerfile rules. Keys are node types, optionally with
 * an `:exit` suffix.
 */
export type DockerRuleVisitor = CustomRuleVisitorWithExit<{
	Dockerfile?(node: DockerfileNode): void;
	Comment?(node: CommentNode): void;
	ParserDirective?(node: ParserDirectiveNode): void;
	FromInstruction?(node: FromInstructionNode): void;
	RunInstruction?(node: RunInstructionNode): void;
	CmdInstruction?(node: CmdInstructionNode): void;
	EntrypointInstruction?(node: EntrypointInstructionNode): void;
	ShellInstruction?(node: ShellInstructionNode): void;
	CopyInstruction?(node: CopyInstructionNode): void;
	AddInstruction?(node: AddInstructionNode): void;
	EnvInstruction?(node: EnvInstructionNode): void;
	ArgInstruction?(node: ArgInstructionNode): void;
	LabelInstruction?(node: LabelInstructionNode): void;
	WorkdirInstruction?(node: WorkdirInstructionNode): void;
	UserInstruction?(node: UserInstructionNode): void;
	ExposeInstruction?(node: ExposeInstructionNode): void;
	VolumeInstruction?(node: VolumeInstructionNode): void;
	StopsignalInstruction?(node: StopsignalInstructionNode): void;
	HealthcheckInstruction?(node: HealthcheckInstructionNode): void;
	OnbuildInstruction?(node: OnbuildInstructionNode): void;
	MaintainerInstruction?(node: MaintainerInstructionNode): void;
	GenericInstruction?(node: GenericInstructionNode): void;
	Argument?(node: ArgumentNode): void;
	Flag?(node: FlagNode): void;
	KeyValuePair?(node: KeyValuePairNode): void;
	ImageReference?(node: ImageReferenceNode): void;
	StageName?(node: StageNameNode): void;
	ShellForm?(node: ShellFormNode): void;
	ExecForm?(node: ExecFormNode): void;
}>;

export type DockerRuleDefinitionTypeOptions = {
	LangOptions: DockerLanguageOptions;
	Code: DockerSourceCode;
	Visitor: DockerRuleVisitor;
	Node: DockerNode;
};

export type DockerRuleDefinition<
	Options extends Partial<CustomRuleTypeDefinitions> = object,
> = CustomRuleDefinitionType<DockerRuleDefinitionTypeOptions, Options>;
