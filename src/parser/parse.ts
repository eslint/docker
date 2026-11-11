/**
 * @fileoverview Parses Dockerfile source code into an ESTree-style syntax
 * tree by wrapping the dockerfile-ast parser (the parser behind Docker's
 * official language server) and translating its tree. See
 * docs/syntax-tree.md for the tree format.
 * @author Claude Fable 5
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import {
	DockerfileParser,
	From,
	Healthcheck,
	Instruction,
	JSONInstruction,
	ModifiableInstruction,
	Onbuild,
	PropertyInstruction,
} from "dockerfile-ast";
import type {
	ArgumentNode,
	CommandBodyNode,
	CommentNode,
	DockerfileNode,
	ExecFormNode,
	FlagNode,
	InstructionNode,
	KeyValuePairNode,
	ParserDirectiveNode,
	ShellFormNode,
} from "../types.js";

/** An LSP-style position as reported by dockerfile-ast. */
interface Position {
	line: number;
	character: number;
}

/** An LSP-style range as reported by dockerfile-ast. */
interface Range {
	start: Position;
	end: Position;
}

export interface DockerParseResult {
	ast: DockerfileNode;
	comments: CommentNode[];
}

/**
 * Creates a converter from LSP line/character positions to character
 * offsets in the source text.
 */
function createPositionConverter(
	text: string,
): (position: Range["start"]) => number {
	const lineStarts = [0];

	for (let i = 0; i < text.length; i++) {
		if (text[i] === "\n") {
			lineStarts.push(i + 1);
		}
	}

	return position => {
		const lineStart = lineStarts[
			Math.min(position.line, lineStarts.length - 1)
		] as number;

		return Math.min(lineStart + position.character, text.length);
	};
}

/**
 * Escapes a string for literal use inside a regular expression.
 */
function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Parses Dockerfile source code into an ESTree-style syntax tree. The
 * underlying parser is error-tolerant, so parsing never throws: malformed
 * input still produces a tree.
 */
export function parseDocker(text: string): DockerParseResult {
	const dockerfile = DockerfileParser.parse(text);
	const offsetAt = createPositionConverter(text);
	const continuationPattern = new RegExp(
		`${escapeRegExp(dockerfile.getEscapeCharacter())}[ \\t]*\\r?\\n`,
		"gu",
	);

	const spanOf = (range: Range): { start: number; end: number } => ({
		start: offsetAt(range.start),
		end: offsetAt(range.end),
	});

	function argumentNode(value: string, range: Range): ArgumentNode {
		return { type: "Argument", value, ...spanOf(range) };
	}

	function convertFlags(instruction: ModifiableInstruction): FlagNode[] {
		return instruction.getFlags().map(flag => ({
			type: "Flag" as const,
			name: flag.getName(),
			value: flag.getValue(),
			...spanOf(flag.getRange()),
		}));
	}

	function convertArguments(instruction: Instruction): ArgumentNode[] {
		return instruction
			.getArguments()
			.map(argument =>
				argumentNode(argument.getValue(), argument.getRange()),
			);
	}

	/**
	 * Converts the string elements of a JSON (exec form) array. The
	 * upstream parser collapses whitespace in its argument values, so the
	 * value is sliced out of the source text instead: it is the raw text
	 * between the quotes. Offsets include the quotes.
	 */
	function convertJsonStrings(instruction: JSONInstruction): ArgumentNode[] {
		return instruction.getJSONStrings().map(jsonString => {
			const inner = spanOf(jsonString.getJSONRange());

			return {
				type: "Argument" as const,
				value: text.slice(inner.start, inner.end),
				...spanOf(jsonString.getRange()),
			};
		});
	}

	/**
	 * Converts the JSON array of an exec-form instruction. The node spans
	 * from the opening to the closing bracket.
	 */
	function convertExecForm(instruction: JSONInstruction): ExecFormNode {
		const elements = convertJsonStrings(instruction);
		const openingBracket = instruction.getOpeningBracket();
		const closingBracket = instruction.getClosingBracket();
		const first = openingBracket
			? spanOf(openingBracket.getRange())
			: (elements[0] as ArgumentNode);
		const last = closingBracket
			? spanOf(closingBracket.getRange())
			: (elements.at(-1) ?? first);

		return {
			type: "ExecForm",
			elements,
			start: first.start,
			end: last.end,
		};
	}

	/**
	 * Converts the arguments of a shell-form instruction. The node spans
	 * from the first to the last token.
	 */
	function convertShellForm(args: ArgumentNode[]): ShellFormNode {
		return {
			type: "ShellForm",
			arguments: args,
			start: (args[0] as ArgumentNode).start,
			end: (args.at(-1) as ArgumentNode).end,
		};
	}

	function convertCommandBody(
		instruction: JSONInstruction,
	): CommandBodyNode | null {
		if (instruction.getOpeningBracket()) {
			return convertExecForm(instruction);
		}

		const args = convertArguments(instruction);

		return args.length > 0 ? convertShellForm(args) : null;
	}

	/**
	 * Combines all arguments of an instruction that takes its entire
	 * remaining text as one value (such as WORKDIR, where a path may
	 * contain whitespace). The value is the source text from the first to
	 * the last argument with line continuations removed; offsets span the
	 * same text.
	 */
	function joinArguments(args: ArgumentNode[]): ArgumentNode | null {
		const first = args[0];
		const last = args.at(-1);

		if (!first || !last) {
			return null;
		}

		return {
			type: "Argument",
			value: text
				.slice(first.start, last.end)
				.replace(continuationPattern, ""),
			start: first.start,
			end: last.end,
		};
	}

	function convertPairs(
		instruction: PropertyInstruction,
	): KeyValuePairNode[] {
		return instruction.getProperties().map(property => {
			const valueRange = property.getValueRange();
			const value = property.getValue();

			return {
				type: "KeyValuePair" as const,
				key: argumentNode(property.getName(), property.getNameRange()),
				value:
					valueRange && value !== null
						? argumentNode(value, valueRange)
						: null,
				...spanOf(property.getRange()),
			};
		});
	}

	function convertInstruction(instruction: Instruction): InstructionNode {
		const keyword = instruction.getKeyword();
		const span = spanOf(instruction.getRange());

		if (instruction instanceof From) {
			const imageRange = instruction.getImageRange();
			const stageName = instruction.getBuildStage();
			const stageRange = instruction.getBuildStageRange();

			return {
				type: "FromInstruction",
				keyword: "FROM",
				flags: convertFlags(instruction),
				image: imageRange
					? {
							type: "ImageReference",
							name: instruction.getImageName() ?? "",
							tag: instruction.getImageTag(),
							digest: instruction.getImageDigest(),
							...spanOf(imageRange),
						}
					: null,
				alias:
					stageName !== null && stageRange
						? {
								type: "StageName",
								name: stageName,
								...spanOf(stageRange),
							}
						: null,
				...span,
			};
		}

		if (instruction instanceof Healthcheck) {
			const subcommand = instruction.getSubcommand();
			const args = convertArguments(instruction);
			const subcommandNode = subcommand
				? argumentNode(subcommand.getValue(), subcommand.getRange())
				: null;

			return {
				type: "HealthcheckInstruction",
				keyword: "HEALTHCHECK",
				flags: convertFlags(instruction),
				subcommand: subcommandNode,
				arguments: subcommandNode
					? args.filter(
							argument => argument.start > subcommandNode.start,
						)
					: args,
				...span,
			};
		}

		if (instruction instanceof Onbuild) {
			const trigger = instruction.getTriggerInstruction();

			return {
				type: "OnbuildInstruction",
				keyword: "ONBUILD",
				trigger: trigger ? convertInstruction(trigger) : null,
				...span,
			};
		}

		if (instruction instanceof PropertyInstruction) {
			const pairs = convertPairs(instruction);

			switch (keyword) {
				case "ENV":
					return { type: "EnvInstruction", keyword, pairs, ...span };
				case "ARG":
					return { type: "ArgInstruction", keyword, pairs, ...span };
				case "LABEL":
					return {
						type: "LabelInstruction",
						keyword,
						pairs,
						...span,
					};
			}
		}

		if (instruction instanceof JSONInstruction) {
			switch (keyword) {
				case "RUN":
					return {
						type: "RunInstruction",
						keyword,
						flags: convertFlags(instruction),
						command: convertCommandBody(instruction),
						...span,
					};
				case "CMD":
					return {
						type: "CmdInstruction",
						keyword,
						command: convertCommandBody(instruction),
						...span,
					};
				case "ENTRYPOINT":
					return {
						type: "EntrypointInstruction",
						keyword,
						command: convertCommandBody(instruction),
						...span,
					};
				case "SHELL": {
					return {
						type: "ShellInstruction",
						keyword,
						command: instruction.getOpeningBracket()
							? convertExecForm(instruction)
							: null,
						...span,
					};
				}
				case "COPY":
				case "ADD": {
					const args = instruction.getOpeningBracket()
						? convertJsonStrings(instruction)
						: convertArguments(instruction);
					const shared = {
						keyword,
						flags: convertFlags(instruction),
						sources: args.slice(0, -1),
						destination: args.at(-1) ?? null,
						...span,
					};

					return keyword === "COPY"
						? { type: "CopyInstruction", ...shared, keyword }
						: { type: "AddInstruction", ...shared, keyword };
				}
				case "VOLUME":
					return {
						type: "VolumeInstruction",
						keyword,
						paths: instruction.getOpeningBracket()
							? convertJsonStrings(instruction)
							: convertArguments(instruction),
						...span,
					};
			}
		}

		const args = convertArguments(instruction);

		switch (keyword) {
			case "WORKDIR":
				return {
					type: "WorkdirInstruction",
					keyword,
					path: joinArguments(args),
					...span,
				};
			case "USER":
				return {
					type: "UserInstruction",
					keyword,
					user: args[0] ?? null,
					...span,
				};
			case "EXPOSE":
				return {
					type: "ExposeInstruction",
					keyword,
					ports: args,
					...span,
				};
			case "STOPSIGNAL":
				return {
					type: "StopsignalInstruction",
					keyword,
					signal: args[0] ?? null,
					...span,
				};
			case "MAINTAINER":
				return {
					type: "MaintainerInstruction",
					keyword,
					arguments: args,
					...span,
				};
			default:
				return {
					type: "GenericInstruction",
					keyword,
					arguments: args,
					...span,
				};
		}
	}

	const comments: CommentNode[] = dockerfile.getComments().map(comment => ({
		type: "Comment",
		text: comment.getContent(),
		...spanOf(comment.getRange()),
	}));

	const directives: ParserDirectiveNode[] = dockerfile
		.getDirectives()
		.map(directive => ({
			type: "ParserDirective",
			name: directive.getName(),
			value: directive.getValue(),
			...spanOf(directive.getRange()),
		}));

	const ast: DockerfileNode = {
		type: "Dockerfile",
		body: dockerfile.getInstructions().map(convertInstruction),
		comments,
		directives,
		start: 0,
		end: text.length,
	};

	return { ast, comments };
}
