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
 * @param word The option word, starting with `-`.
 * @param nextWord The word that follows the option, if any.
 * @returns `true` if the option takes `nextWord` as its value.
 */
function takesNextWord(word: string, nextWord: string | undefined): boolean {
	if (VALUE_LONG_OPTIONS.has(word)) {
		return true;
	}

	for (let i = 1; i < word.length && !word.startsWith("--"); i++) {
		const letter = word[i] as string;

		// `-a` is `--host-architecture` (with a value) for commands such as
		// `build-dep`, but `--all-versions` (without one) for `apt list`.
		if (
			letter === "a" &&
			nextWord !== undefined &&
			ALL_VERSIONS_SUBCOMMANDS.has(nextWord)
		) {
			continue;
		}

		if (VALUE_SHORT_OPTIONS.has(letter)) {
			// The rest of the word, if any, is the option's value.
			return i === word.length - 1;
		}
	}

	if (nextWord === undefined) {
		return false;
	}

	// A quiet level may follow `-q` as a separate word (`-q 2`).
	if (word.endsWith("q") && /^\d+$/u.test(nextWord)) {
		return true;
	}

	// A Boolean option such as `-y` or `--assume-yes` takes an explicit
	// value from the following word (`-y true`) unless one is attached.
	return !word.includes("=") && BOOLEAN_VALUES.has(nextWord.toLowerCase());
}

/** The values APT accepts for a Boolean option. */
const BOOLEAN_VALUES = new Set([
	"0",
	"1",
	"no",
	"false",
	"without",
	"off",
	"disable",
	"yes",
	"true",
	"with",
	"on",
	"enable",
]);

/**
 * APT subcommands for which `-a` means `--all-versions`, so it does not
 * take the following word as its value.
 */
const ALL_VERSIONS_SUBCOMMANDS = new Set([
	"list",
	"show",
	"showsrc",
	"policy",
	"madison",
]);

/**
 * Returns the APT subcommand: the first word that is neither an option
 * nor the value of an option.
 * @param words The decoded words that follow the APT command name.
 * @returns The subcommand, or `undefined` if there is none.
 */
function findSubcommand(words: string[]): string | undefined {
	for (let i = 0; i < words.length; i++) {
		const word = words[i] as string;

		if (word === "-" || !word.startsWith("-")) {
			return word;
		}

		if (takesNextWord(word, words[i + 1])) {
			i++;
		}
	}

	return undefined;
}

/** Characters that a backslash escapes inside double quotes. */
const DOUBLE_QUOTE_ESCAPABLE = new Set(["$", "`", '"', "\\"]);

/**
 * Decodes the source spelling of tokens into shell words: tokens inside
 * an open quote are merged with the following tokens, and quotes and
 * escapes are removed, so `'upgrade'` becomes `upgrade` and `-o 'a b'`
 * gives one value word.
 * @param values The source spelling of each token.
 * @returns The decoded shell words.
 */
function toShellWords(values: string[]): string[] {
	const words: string[] = [];
	let quote: string | null = null;
	let pending: string | null = null;

	for (const value of values) {
		let word = "";

		for (let i = 0; i < value.length; i++) {
			const character = value[i] as string;

			if (
				character === "\\" &&
				i + 1 < value.length &&
				(quote === null ||
					(quote === '"' &&
						DOUBLE_QUOTE_ESCAPABLE.has(value[i + 1] as string)))
			) {
				i++;
				word += value[i];
			} else if (
				quote === null &&
				(character === '"' || character === "'")
			) {
				quote = character;
			} else if (character === quote) {
				quote = null;
			} else {
				word += character;
			}
		}

		pending = pending === null ? word : `${pending} ${word}`;

		if (quote === null) {
			words.push(pending);
			pending = null;
		}
	}

	if (pending !== null) {
		words.push(pending);
	}

	return words;
}

/** A leading shell variable assignment such as `DEBIAN_FRONTEND=x`. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;

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

	/**
	 * Creates the rule's visitor.
	 * @param context The rule context.
	 * @returns A visitor that checks RUN instructions.
	 */
	create(context) {
		const { sourceCode } = context;

		return {
			/**
			 * Reports each APT upgrade command in a shell-form RUN
			 * instruction.
			 * @param node The RUN instruction to check.
			 */
			RunInstruction(node) {
				if (node.command?.type !== "ShellForm") {
					return;
				}

				for (const command of splitShellCommands(
					node.command,
					sourceCode.text,
				)) {
					const words = toShellWords(command.raw);

					// Assignments before the executable only set its
					// environment.
					while (
						words.length > 0 &&
						ASSIGNMENT.test(words[0] as string)
					) {
						words.shift();
					}

					const [name, ...rest] = words;

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
