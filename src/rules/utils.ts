/**
 * @fileoverview Shared helpers for rules that analyze shell-form commands.
 *
 * Shell-form arguments are whitespace-delimited tokens. The helpers here
 * split a token list into simple commands using standalone operator tokens
 * and trailing semicolons, tracking quote state so that quoted operators
 * (`echo "a && b"`) do not split; they intentionally do not implement full
 * shell parsing.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import type { ArgumentNode, ShellFormNode } from "../types.js";

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/** Operator tokens that separate simple commands. */
const COMMAND_SEPARATORS = new Set(["&&", "||", ";", "|", "&"]);

/**
 * A simple command inside a shell-form instruction: the tokens that make
 * it up plus their cleaned-up string values.
 */
export interface ShellCommand {
	/** The tokens of this command, in source order. */
	tokens: ArgumentNode[];

	/**
	 * The token values with a leading `(` removed from the first word and
	 * a trailing separator `;` (unquoted and unescaped) removed from the
	 * last word.
	 */
	words: string[];
}

/**
 * Splits shell-form arguments into simple commands on `&&`, `||`, `;`,
 * `|`, and `&` operator tokens, as well as on tokens ending with an
 * unquoted, unescaped `;`. Quoting and escaping are read from the source
 * text because argument values already have some escapes resolved.
 */
export function splitShellCommands(
	shellForm: ShellFormNode,
	sourceText: string,
): ShellCommand[] {
	const commands: ShellCommand[] = [];
	let current: ArgumentNode[] = [];

	const push = (endsWithSeparator = false): void => {
		if (current.length > 0) {
			commands.push({
				tokens: current,
				words: current.map((token, index) => {
					let word = token.value;

					if (index === 0) {
						word = word.replace(/^\(+/u, "");
					}

					if (endsWithSeparator && index === current.length - 1) {
						word = word.replace(/;$/u, "");
					}

					return word;
				}),
			});
			current = [];
		}
	};

	let quote: string | null = null;

	/**
	 * Updates the open-quote state after consuming a token. Returns whether
	 * the token ends with a semicolon that is neither quoted nor escaped,
	 * which separates commands.
	 */
	const consumeQuotes = (value: string): boolean => {
		let endsWithSeparator = false;

		for (let i = 0; i < value.length; i++) {
			const character = value[i] as string;

			endsWithSeparator = false;

			if (character === "\\" && quote !== "'") {
				i++;
			} else if (character === ";" && quote === null) {
				endsWithSeparator = true;
			} else if (
				quote === null &&
				(character === '"' || character === "'")
			) {
				quote = character;
			} else if (character === quote) {
				quote = null;
			}
		}

		return endsWithSeparator;
	};

	for (const argument of shellForm.arguments) {
		if (
			quote === null &&
			COMMAND_SEPARATORS.has(
				sourceText.slice(argument.start, argument.end),
			)
		) {
			push();
			continue;
		}

		current.push(argument);

		if (consumeQuotes(sourceText.slice(argument.start, argument.end))) {
			push(true);
		}
	}

	push();

	return commands;
}

/**
 * Returns the offsets spanning a list of tokens.
 */
export function spanOfTokens(tokens: ArgumentNode[]): {
	start: number;
	end: number;
} {
	return {
		start: (tokens[0] as ArgumentNode).start,
		end: (tokens.at(-1) as ArgumentNode).end,
	};
}
