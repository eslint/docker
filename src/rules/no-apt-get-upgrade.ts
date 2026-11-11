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

/**
 * APT options whose value is given as the following word, such as
 * `-o Acquire::Retries=3` or `-c apt.conf`.
 */
const VALUE_OPTIONS = new Set([
	"-o",
	"--option",
	"-c",
	"--config-file",
	"-t",
	"--target-release",
	"--default-release",
	"-a",
	"--host-architecture",
]);

/**
 * Returns the APT subcommand: the first word that is neither an option
 * nor the value of an option.
 */
function findSubcommand(words: string[]): string | undefined {
	for (let i = 0; i < words.length; i++) {
		const word = words[i] as string;

		if (VALUE_OPTIONS.has(word)) {
			i++;
		} else if (!word.startsWith("-")) {
			return word;
		}
	}

	return undefined;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "noUpgrade" }> = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow `apt-get upgrade` in `RUN` instructions",
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

				for (const command of splitShellCommands(
					node.command,
					sourceCode.text,
				)) {
					const [name, ...rest] = command.words;

					if (name === undefined || !APT_COMMANDS.has(name)) {
						continue;
					}

					const subcommand = findSubcommand(rest);

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
