/**
 * @fileoverview Shared helpers for rules that analyze shell-form commands.
 *
 * Shell-form arguments are whitespace-delimited tokens. The helpers here
 * split a token list into simple commands using standalone operator tokens
 * and trailing semicolons, tracking quote state so that quoted operators
 * (`echo "a && b"`) do not split; they intentionally do not implement full
 * shell parsing. An unquoted word starting with `#` begins a shell comment
 * and ends the scan.
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
 * A Dockerfile line continuation (with either escape character) plus any
 * full-line comments and empty lines after it. Docker removes these
 * before the shell sees the command, so they are removed from the raw
 * token text before scanning it.
 */
const CONTINUATION = /[\\`][ \t]*\r?\n(?:[ \t]*(?:#[^\n]*)?\r?\n)*/gu;

/** A token made up only of subshell group openers, such as `(`. */
const GROUP_OPENER = /^\(+$/u;

/**
 * A list of tokens with at least one element.
 */
export type NonEmptyTokens = [ArgumentNode, ...ArgumentNode[]];

/**
 * A simple command inside a shell-form instruction: the tokens that make
 * it up plus their cleaned-up string values.
 */
export interface ShellCommand {
	/** The tokens of this command, in source order. */
	tokens: NonEmptyTokens;

	/**
	 * The token values with an unescaped leading `(` removed from the first
	 * word and a trailing separator `;` (unquoted and unescaped) removed
	 * from the last word. Standalone `(` tokens are omitted from both
	 * `tokens` and `words`.
	 */
	words: string[];
}

/**
 * Splits shell-form arguments into simple commands on `&&`, `||`, `;`,
 * `|`, and `&` operator tokens, as well as on tokens ending with an
 * unquoted, unescaped `;`. Scanning stops at an unquoted shell comment.
 * Quoting and escaping are read from the source text because argument
 * values already have some escapes resolved.
 */
export function splitShellCommands(
	shellForm: ShellFormNode,
	sourceText: string,
): ShellCommand[] {
	const commands: ShellCommand[] = [];
	let current: ArgumentNode[] = [];
	let currentRaw: string[] = [];

	const push = (endsWithSeparator = false): void => {
		// A standalone `(` opens a subshell; the command starts after it.
		while (
			currentRaw.length > 0 &&
			GROUP_OPENER.test(currentRaw[0] ?? "")
		) {
			current.shift();
			currentRaw.shift();
		}

		const [first, ...rest] = current;

		if (first) {
			const tokens: NonEmptyTokens = [first, ...rest];
			const firstRaw = currentRaw[0] as string;

			commands.push({
				tokens,
				words: tokens.map((token, index) => {
					let word = token.value;

					// Only an unescaped `(` opens a group; `\(cd` is a word.
					if (index === 0 && firstRaw.startsWith("(")) {
						word = word.replace(/^\(+/u, "");
					}

					if (endsWithSeparator && index === tokens.length - 1) {
						word = word.replace(/;(?:#.*)?$/u, "");
					}

					return word;
				}),
			});
		}

		current = [];
		currentRaw = [];
	};

	let quote: string | null = null;

	/**
	 * Updates the open-quote state after consuming a token. Reports whether
	 * the token ends with a semicolon that is neither quoted nor escaped,
	 * which separates commands, and whether a comment starts right after
	 * such a semicolon (`ok;# note`).
	 */
	const consumeQuotes = (
		value: string,
	): { endsWithSeparator: boolean; startsComment: boolean } => {
		let endsWithSeparator = false;

		for (let i = 0; i < value.length; i++) {
			const character = value[i] as string;

			endsWithSeparator = false;

			if (character === "\\" && quote !== "'") {
				i++;
			} else if (character === ";" && quote === null) {
				if (value[i + 1] === "#") {
					return { endsWithSeparator: true, startsComment: true };
				}

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

		return { endsWithSeparator, startsComment: false };
	};

	let previousEnd: number | null = null;

	for (const argument of shellForm.arguments) {
		const raw = sourceText
			.slice(argument.start, argument.end)
			.replace(CONTINUATION, "");
		const gap =
			previousEnd === null
				? ""
				: sourceText.slice(previousEnd, argument.start);

		previousEnd = argument.end;

		// An escaped blank (`word\ #tag`) keeps the `#` inside the word.
		if (quote === null && raw.startsWith("#") && !/\\[ \t]/u.test(gap)) {
			// The shell ignores the rest of the line after a comment.
			break;
		}

		if (quote === null && COMMAND_SEPARATORS.has(raw)) {
			push();
			continue;
		}

		current.push(argument);
		currentRaw.push(raw);

		const { endsWithSeparator, startsComment } = consumeQuotes(raw);

		if (endsWithSeparator) {
			push(true);
		}

		if (startsComment) {
			break;
		}
	}

	push();

	return commands;
}

/**
 * Returns the offsets spanning a non-empty list of tokens.
 */
export function spanOfTokens(tokens: Readonly<NonEmptyTokens>): {
	start: number;
	end: number;
} {
	return {
		start: tokens[0].start,
		end: (tokens.at(-1) as ArgumentNode).end,
	};
}
