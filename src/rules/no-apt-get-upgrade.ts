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
 * Long APT options whose value is given as the following word, such as
 * `--option Acquire::Retries=3` or `--solver internal`.
 */
const VALUE_LONG_OPTIONS = new Set([
	"--option",
	"--config-file",
	"--target-release",
	"--default-release",
	"--host-architecture",
	"--solver",
	"--snapshot",
]);

/**
 * Short APT options that take a value, such as `-o Acquire::Retries=3`
 * or `-c apt.conf`. The value is either the rest of the word (`-tbookworm`)
 * or, when the option ends the word, the following word.
 */
const VALUE_SHORT_OPTIONS = new Set(["o", "c", "t", "a", "S"]);

/**
 * Returns whether an option word consumes the following word as its
 * value. Short-option clusters such as `-qo` are read one letter at a
 * time, the way APT parses them.
 */
function takesNextWord(word: string): boolean {
	if (word.startsWith("--")) {
		return VALUE_LONG_OPTIONS.has(word);
	}

	for (let i = 1; i < word.length; i++) {
		if (VALUE_SHORT_OPTIONS.has(word[i] as string)) {
			// The rest of the word, if any, is the option's value.
			return i === word.length - 1;
		}
	}

	return false;
}

/**
 * Returns the APT subcommand: the first word that is neither an option
 * nor the value of an option.
 */
function findSubcommand(words: string[]): string | undefined {
	for (let i = 0; i < words.length; i++) {
		const word = words[i] as string;

		if (word === "-" || !word.startsWith("-")) {
			return word;
		}

		if (takesNextWord(word)) {
			i++;
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
