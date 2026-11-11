/**
 * @fileoverview Rule to disallow `cd` in RUN instructions in favor of
 * WORKDIR. Each RUN starts a fresh shell, so directory changes do not
 * persist and obscure the build context.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import { splitShellCommands, spanOfTokens } from "./utils.js";
import type { DockerNode, DockerRuleDefinition } from "../types.js";

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * A path without shell operators, quoting, globs, or expansions, which
 * means the same thing to `cd` and to WORKDIR.
 */
const LITERAL_PATH = /^[\w./@+-]+$/u;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "useWorkdir" }> = {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow `cd` in `RUN` instructions in favor of `WORKDIR`",
			recommended: true,
			url: "https://github.com/eslint/docker/blob/main/docs/rules/no-cd-in-run.md",
		},
		fixable: "code",
		schema: [],
		messages: {
			useWorkdir:
				"Use WORKDIR to switch directories instead of `cd` in RUN.",
		},
	},

	create(context) {
		const { sourceCode } = context;

		return {
			RunInstruction(node) {
				if (node.command?.type !== "ShellForm") {
					return;
				}

				const commands = splitShellCommands(
					node.command,
					sourceCode.text,
				);

				for (const command of commands) {
					if (command.words[0] !== "cd") {
						continue;
					}

					// `RUN cd /dir` on its own does nothing except hide a
					// missing WORKDIR, so it can be fixed directly. Only
					// a plain `cd` with a literal path qualifies: attached
					// operators, subshells, quoting, and expansions (such
					// as `~` or `$HOME`) would change meaning in WORKDIR.
					const [cdToken, directoryToken] = command.tokens;
					const directory =
						directoryToken &&
						sourceCode.text.slice(
							directoryToken.start,
							directoryToken.end,
						);
					const canFix =
						commands.length === 1 &&
						command.tokens.length === 2 &&
						node.flags.length === 0 &&
						cdToken !== undefined &&
						sourceCode.text.slice(cdToken.start, cdToken.end) ===
							"cd" &&
						directory !== undefined &&
						LITERAL_PATH.test(directory) &&
						!/[\n\r]/u.test(
							sourceCode.text.slice(node.start, node.end),
						);

					context.report({
						loc: sourceCode.getLoc(
							spanOfTokens(command.tokens) as DockerNode,
						),
						messageId: "useWorkdir",
						fix: canFix
							? fixer =>
									fixer.replaceTextRange(
										[node.start, node.end],
										`WORKDIR ${directory}`,
									)
							: undefined,
					});
				}
			},
		};
	},
};

export default rule;
