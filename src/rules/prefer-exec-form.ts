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

		function check(
			node: CmdInstructionNode | EntrypointInstructionNode,
		): void {
			const { command } = node;

			if (command?.type !== "ShellForm") {
				return;
			}

			// Commands relying on shell features (variables, pipes,
			// redirection, quoting, environment assignments, builtins)
			// cannot be converted automatically.
			const first = command.arguments[0]?.value ?? "";
			const canFix =
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
			CmdInstruction: check,
			EntrypointInstruction: check,
		};
	},
};

export default rule;
