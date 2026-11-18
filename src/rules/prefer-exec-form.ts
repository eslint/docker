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
		 * @param customShell Whether a SHELL instruction may apply, in
		 * which case the command may need a non-POSIX shell.
		 * @param stageHasCmd Whether the instruction's stage sets CMD.
		 */
		function check(
			node: CmdInstructionNode | EntrypointInstructionNode,
			customShell: boolean,
			stageHasCmd: boolean,
		): void {
			const { command } = node;

			if (command?.type !== "ShellForm") {
				return;
			}

			// Commands relying on shell features (variables, pipes,
			// redirection, quoting, environment assignments, builtins)
			// cannot be converted automatically. After a SHELL
			// instruction the command may be written for another shell
			// (such as PowerShell cmdlets), so it is never converted.
			// A shell-form ENTRYPOINT ignores CMD, but an exec-form one
			// appends it, so ENTRYPOINT is not converted when its stage
			// sets CMD.
			const first = command.arguments[0]?.value ?? "";
			const canFix =
				!customShell &&
				!(node.type === "EntrypointInstruction" && stageHasCmd) &&
				!ASSIGNMENT.test(first) &&
				!SHELL_BUILTINS.has(first) &&
				command.arguments.every(
					argument =>
						SAFE_TOKEN.test(argument.value) &&
						SAFE_TOKEN.test(
							sourceCode.text.slice(argument.start, argument.end),
						),
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
				const stages: InstructionNode[][] = [[]];

				for (const instruction of node.body) {
					if (instruction.type === "FromInstruction") {
						stages.push([]);
					}

					(stages.at(-1) as InstructionNode[]).push(instruction);
				}

				// A stage can inherit SHELL from an earlier stage, so any
				// preceding SHELL instruction counts.
				let customShell = false;

				for (const stage of stages) {
					const stageHasCmd = stage.some(
						instruction => instruction.type === "CmdInstruction",
					);

					for (const instruction of stage) {
						if (instruction.type === "ShellInstruction") {
							customShell = true;
						} else if (
							instruction.type === "CmdInstruction" ||
							instruction.type === "EntrypointInstruction"
						) {
							check(instruction, customShell, stageHasCmd);
						}
					}
				}
			},
		};
	},
};

export default rule;
