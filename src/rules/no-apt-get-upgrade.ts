/**
 * @fileoverview Rule to disallow `apt-get upgrade` and friends in RUN
 * instructions. Upgrades are unreproducible and belong in the base image.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import { splitShellCommands, spanOfTokens } from "./utils.js";
import type { DockerNode, DockerRuleDefinition } from "../types.js";

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const APT_COMMANDS = new Set(["apt-get", "apt"]);
const UPGRADE_SUBCOMMANDS = new Set([
	"upgrade",
	"dist-upgrade",
	"full-upgrade",
]);

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "noUpgrade" }> = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow `apt-get upgrade` in RUN instructions",
			recommended: true,
			url: "https://github.com/eslint/docker/blob/main/docs/rules/no-apt-get-upgrade.md",
		},
		schema: [],
		messages: {
			noUpgrade:
				"Do not run '{{command}} {{subcommand}}'; use an updated base image instead.",
		},
	},

	create(context) {
		const { sourceCode } = context;

		return {
			RunInstruction(node) {
				if (node.command?.type !== "ShellForm") {
					return;
				}

				for (const command of splitShellCommands(node.command)) {
					const [name, ...rest] = command.words;

					if (name === undefined || !APT_COMMANDS.has(name)) {
						continue;
					}

					const subcommand = rest.find(word => !word.startsWith("-"));

					if (
						subcommand !== undefined &&
						UPGRADE_SUBCOMMANDS.has(subcommand)
					) {
						context.report({
							loc: sourceCode.getLoc(
								spanOfTokens(command.tokens) as DockerNode,
							),
							messageId: "noUpgrade",
							data: { command: name, subcommand },
						});
					}
				}
			},
		};
	},
};

export default rule;
