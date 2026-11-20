/**
 * @fileoverview Rule to disallow `sudo` in RUN instructions. RUN already
 * executes as root (or the current USER), and sudo's TTY and signal
 * behavior causes unexpected build failures.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import { splitShellCommands, spanOfTokens } from "./utils.js";
import type { DockerNode, DockerRuleDefinition } from "../types.js";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "noSudo" }> = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow `sudo` in `RUN` instructions",
			recommended: true,
			url: "https://github.com/eslint/docker/blob/main/docs/rules/no-sudo.md",
		},
		schema: [],
		messages: {
			noSudo: "Do not use sudo in RUN; switch users with USER instead.",
		},
	},

	create(context) {
		const { sourceCode } = context;

		return {
			RunInstruction(node) {
				if (node.command?.type !== "ShellForm") {
					return;
				}

				for (const command of splitShellCommands(
					node.command,
					sourceCode.text,
				)) {
					if (command.words[0] === "sudo") {
						context.report({
							loc: sourceCode.getLoc(
								spanOfTokens(command.tokens) as DockerNode,
							),
							messageId: "noSudo",
						});
					}
				}
			},
		};
	},
};

export default rule;
