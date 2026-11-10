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
 * metacharacters, quotes, or variable expansions.
 */
const SAFE_TOKEN = /^[\w./:=@%+,-]+$/u;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "useExecForm" }> = {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Require the exec (JSON array) form for CMD and ENTRYPOINT",
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
		function check(
			node: CmdInstructionNode | EntrypointInstructionNode,
		): void {
			const { command } = node;

			if (command?.type !== "ShellForm") {
				return;
			}

			// Commands relying on shell features (variables, pipes,
			// redirection, quoting) cannot be converted automatically.
			const canFix = command.arguments.every(argument =>
				SAFE_TOKEN.test(argument.value),
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
