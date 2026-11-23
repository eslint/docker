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
		// LF, CRLF, and a standalone CR each end a line.
		if (text[i] === "\n" || (text[i] === "\r" && text[i + 1] !== "\n")) {
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
	const escapeCharacter = dockerfile.getEscapeCharacter();

	// A line continuation, together with any full-line comments and empty
	// lines that follow it: Docker removes those before it processes the
	// instruction.
	const continuationPattern = new RegExp(
		`${escapeRegExp(escapeCharacter)}[ \\t]*\\r?\\n(?:[ \\t]*(?:#[^\\n]*)?\\r?\\n)*`,
		"gu",
	);

	/**
	 * Returns the source text between two offsets with line continuations
	 * and the comment lines inside them removed.
	 */
	const logicalText = (start: number, end: number): string =>
		text.slice(start, end).replace(continuationPattern, "");

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

	/**
	 * Determines whether an instruction uses the JSON (exec) form. Docker
	 * treats the arguments as JSON only when they form a complete JSON array
	 * of strings; anything else, such as `RUN [ -f /app ] && make`, is
	 * shell form even though it starts with a bracket.
	 */
	function isJsonForm(instruction: JSONInstruction): boolean {
		const openingBracket = instruction.getOpeningBracket();
		const closingBracket = instruction.getClosingBracket();

		if (!openingBracket || !closingBracket) {
			return false;
		}

		const start = offsetAt(openingBracket.getRange().start);
		const end = offsetAt(closingBracket.getRange().end);
		const argsRange = instruction.getArgumentsRange();

		// The closing bracket must end the arguments.
		if (argsRange && offsetAt(argsRange.end) !== end) {
			return false;
		}

		try {
			const value: unknown = JSON.parse(logicalText(start, end));

			return (
				Array.isArray(value) &&
				value.every(element => typeof element === "string")
			);
		} catch {
			return false;
		}
	}

	function convertCommandBody(
		instruction: JSONInstruction,
	): CommandBodyNode | null {
		if (isJsonForm(instruction)) {
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
			value: logicalText(first.start, last.end),
			start: first.start,
			end: last.end,
		};
	}

	/**
	 * Returns the arguments that belong to the instruction header. When
	 * the instruction uses a heredoc (`COPY <<EOF /app/file`), the upstream
	 * argument list also contains the heredoc body and terminator, which
	 * are not sources or destinations.
	 */
	function headerArguments(
		args: ArgumentNode[],
		instructionStart: number,
	): ArgumentNode[] {
		if (!args.some(argument => argument.value.startsWith("<<"))) {
			return args;
		}

		let headerEnd = instructionStart;
		let continued = false;

		for (;;) {
			const newline = text.indexOf("\n", headerEnd);

			if (newline === -1) {
				return args;
			}

			const line = text.slice(headerEnd, newline).trim();

			headerEnd = newline + 1;

			// Comment and empty lines inside a continuation are removed
			// before the header is parsed, so they do not end it.
			if (continued && (line === "" || line.startsWith("#"))) {
				continue;
			}

			if (!line.endsWith(escapeCharacter)) {
				break;
			}

			continued = true;
		}

		return args.filter(argument => argument.start < headerEnd);
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
			const registry = instruction.getRegistry();
			const imageName = instruction.getImageName() ?? "";

			// dockerfile-ast returns the source spelling of these parts,
			// including line continuations, and drops the registry from
			// the image name.
			const joinLines = <T extends string | null>(value: T): T =>
				(value === null
					? value
					: value.replace(continuationPattern, "")) as T;

			let name = joinLines(
				registry === null ? imageName : `${registry}/${imageName}`,
			);
			let tag = joinLines(instruction.getImageTag());
			const digest = joinLines(instruction.getImageDigest());

			// With a digest present, dockerfile-ast mistakes a registry
			// port for the tag separator and leaves the real tag in the
			// name (`localhost:5000/app:1.2@sha256:...`). A tag separator
			// can only follow the last path separator.
			if (digest !== null && tag === null) {
				const separator = name.lastIndexOf(":");

				if (
					separator > name.lastIndexOf("/") &&
					!name.slice(separator).includes("}")
				) {
					tag = name.slice(separator + 1);
					name = name.slice(0, separator);
				}
			}

			return {
				type: "FromInstruction",
				keyword: "FROM",
				flags: convertFlags(instruction),
				image: imageRange
					? {
							type: "ImageReference",
							name,
							tag,
							digest,
							...spanOf(imageRange),
						}
					: null,
				alias:
					stageName !== null && stageRange
						? {
								type: "StageName",
								name: joinLines(stageName),
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

			// Docker does not allow ONBUILD as a trigger. Converting a nested
			// ONBUILD would recurse once per repetition.
			return {
				type: "OnbuildInstruction",
				keyword: "ONBUILD",
				trigger:
					trigger && !(trigger instanceof Onbuild)
						? convertInstruction(trigger)
						: null,
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
						command: isJsonForm(instruction)
							? convertExecForm(instruction)
							: null,
						...span,
					};
				}
				case "COPY":
				case "ADD": {
					const args = isJsonForm(instruction)
						? convertJsonStrings(instruction)
						: headerArguments(
								convertArguments(instruction),
								span.start,
							);
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
						paths: isJsonForm(instruction)
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
