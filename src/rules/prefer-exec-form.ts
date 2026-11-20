/**
 * @fileoverview Rule to prefer the exec (JSON array) form for CMD and
 * ENTRYPOINT. The shell form wraps the command in `/bin/sh -c`, which
 * swallows signals such as SIGTERM.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import type {
	CmdInstructionNode,
	DockerRuleDefinition,
	EntrypointInstructionNode,
	InstructionNode,
} from "../types.js";

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Tokens that can safely be converted into a JSON array element: no shell
 * metacharacters, quotes, or variable expansions (including Windows
 * `%VAR%` expansion in cmd.exe).
 */
const SAFE_TOKEN = /^[\w./:=@+,-]+$/u;

/**
 * A leading `NAME=value` word, which the shell treats as an environment
 * assignment for the command rather than as the command itself.
 */
const ASSIGNMENT = /^[A-Za-z_]\w*=/u;

/**
 * Shell builtins that have no executable equivalent, so they cannot be
 * run from the exec form.
 */
const SHELL_BUILTINS = new Set([
	".",
	":",
	"alias",
	"bg",
	"break",
	"builtin",
	"cd",
	"command",
	"continue",
	"declare",
	"eval",
	"exec",
	"exit",
	"export",
	"fg",
	"getopts",
	"hash",
	"jobs",
	"let",
	"local",
	"read",
	"readonly",
	"return",
	"set",
	"shift",
	"source",
	"times",
	"trap",
	"type",
	"typeset",
	"ulimit",
	"umask",
	"unalias",
	"unset",
	"wait",
]);

/**
 * Shell builtins whose external executable behaves differently, such as
 * `echo -e`, which dash's builtin prints literally but GNU `echo`
 * interprets. Converting these changes the program that runs.
 */
const AMBIGUOUS_BUILTINS = new Set([
	"[",
	"echo",
	"false",
	"kill",
	"printf",
	"pwd",
	"test",
	"true",
]);

/**
 * Image references and platforms that indicate a Windows image, where the
 * default shell is `cmd.exe` rather than a POSIX shell.
 */
const WINDOWS_IMAGE = /(?:^|\/)(?:windows|servercore|nanoserver)(?:[/:@]|$)/iu;
const WINDOWS_PLATFORM = /^windows(?:\/|$)/iu;

/**
 * Information about a build stage needed to decide whether a fix is safe.
 */
interface StageInfo {
	instructions: InstructionNode[];
	name: string | null;
	base: string | null;
	windows: boolean;
	hasCmd: boolean;
	hasEntrypoint: boolean;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "useExecForm" }> = {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Require the exec (JSON array) form for `CMD` and `ENTRYPOINT`",
			recommended: true,
			url: "https://github.com/eslint/docker/blob/main/docs/rules/prefer-exec-form.md",
		},
		fixable: "code",
		schema: [],
		messages: {
			useExecForm: "Use the exec (JSON array) form for {{keyword}}.",
		},
	},

	create(context) {
		const { sourceCode } = context;

		/**
		 * Reports a shell-form CMD or ENTRYPOINT.
		 * @param node The instruction to check.
		 * @param fixAllowed Whether the instruction's context permits a
		 * fix at all. It does not when a SHELL instruction may apply, the
		 * stage targets Windows, the instruction is an ONBUILD trigger,
		 * or an exec-form ENTRYPOINT would start receiving a CMD.
		 */
		function check(
			node: CmdInstructionNode | EntrypointInstructionNode,
			fixAllowed: boolean,
		): void {
			const { command } = node;

			if (command?.type !== "ShellForm") {
				return;
			}

			// Commands relying on shell features (variables, pipes,
			// redirection, quoting, escaped whitespace, environment
			// assignments, builtins) cannot be converted automatically.
			const first = command.arguments[0]?.value ?? "";
			const canFix =
				fixAllowed &&
				!ASSIGNMENT.test(first) &&
				!SHELL_BUILTINS.has(first) &&
				!AMBIGUOUS_BUILTINS.has(first) &&
				command.arguments.every(
					(argument, index) =>
						SAFE_TOKEN.test(argument.value) &&
						SAFE_TOKEN.test(
							sourceCode.text.slice(argument.start, argument.end),
						) &&
						// Only plain blanks may separate words; an escaped
						// blank (`report\ final.txt`) joins them.
						(index === 0 ||
							/^[ \t]+$/u.test(
								sourceCode.text.slice(
									command.arguments[index - 1]?.end,
									argument.start,
								),
							)),
				);

			context.report({
				node: command,
				messageId: "useExecForm",
				data: { keyword: node.keyword },
				fix: canFix
					? fixer =>
							fixer.replaceTextRange(
								[command.start, command.end],
								`[${command.arguments
									.map(argument =>
										JSON.stringify(argument.value),
									)
									.join(", ")}]`,
							)
					: undefined,
			});
		}

		return {
			Dockerfile(node) {
				// Group instructions into build stages, each starting at
				// a FROM instruction.
				const stages: StageInfo[] = [
					{
						instructions: [],
						name: null,
						base: null,
						windows: false,
						hasCmd: false,
						hasEntrypoint: false,
					},
				];

				for (const instruction of node.body) {
					if (instruction.type === "FromInstruction") {
						const platform = instruction.flags.find(
							flag => flag.name === "platform",
						);
						const base = instruction.image?.name ?? null;

						stages.push({
							instructions: [],
							name: instruction.alias?.name.toLowerCase() ?? null,
							base: base?.toLowerCase() ?? null,
							windows:
								(base !== null && WINDOWS_IMAGE.test(base)) ||
								WINDOWS_PLATFORM.test(platform?.value ?? ""),
							hasCmd: false,
							hasEntrypoint: false,
						});
					}

					const stage = stages.at(-1) as StageInfo;

					stage.instructions.push(instruction);
					stage.hasCmd ||= instruction.type === "CmdInstruction";
					stage.hasEntrypoint ||=
						instruction.type === "EntrypointInstruction";
				}

				/**
				 * Returns whether a stage's ENTRYPOINT would receive a CMD,
				 * either from the stage itself or from a later stage that
				 * builds on it without replacing the ENTRYPOINT.
				 */
				function receivesCmd(index: number): boolean {
					const stage = stages[index] as StageInfo;

					if (stage.hasCmd) {
						return true;
					}

					return stages.some(
						(child, childIndex) =>
							childIndex > index &&
							stage.name !== null &&
							child.base === stage.name &&
							!child.hasEntrypoint &&
							receivesCmd(childIndex),
					);
				}

				// A stage can inherit SHELL from an earlier stage, so any
				// preceding SHELL instruction counts. Windows images use
				// cmd.exe, so the POSIX fix checks do not apply to them.
				let customShell = false;

				stages.forEach((stage, index) => {
					for (const instruction of stage.instructions) {
						if (instruction.type === "ShellInstruction") {
							customShell = true;
						} else if (instruction.type === "CmdInstruction") {
							check(instruction, !customShell && !stage.windows);
						} else if (
							instruction.type === "EntrypointInstruction"
						) {
							check(
								instruction,
								!customShell &&
									!stage.windows &&
									!receivesCmd(index),
							);
						} else if (
							instruction.type === "OnbuildInstruction" &&
							(instruction.trigger?.type === "CmdInstruction" ||
								instruction.trigger?.type ===
									"EntrypointInstruction")
						) {
							// The downstream build decides whether the
							// conversion is safe, so report without a fix.
							check(instruction.trigger, false);
						}
					}
				});
			},
		};
	},
};

export default rule;
