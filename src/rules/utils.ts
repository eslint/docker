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

/**
 * Matches text ending in a blank that is not escaped: preceded by an even
 * number of backslashes.
 */
const UNESCAPED_TRAILING_BLANK = /(?:^|[^\\])(?:\\\\)*[ \t]$/u;

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

	/**
	 * The source spelling of each word, with Dockerfile continuations
	 * removed but quotes and shell escapes kept, trimmed the same way as
	 * `words`. Use this to decode shell quoting, because `words` already
	 * has some escapes resolved.
	 */
	raw: string[];
}

/**
 * Splits shell-form arguments into simple commands on `&&`, `||`, `;`,
 * `|`, and `&` operator tokens, as well as on tokens ending with an
 * unquoted, unescaped `;`. Scanning stops at an unquoted shell comment.
 * Quoting and escaping are read from the source text because argument
 * values already have some escapes resolved.
 * @param shellForm The shell-form command to split.
 * @param sourceText The source text of the Dockerfile containing the
 * command.
 * @returns The simple commands, in source order. Commands with no words
 * are omitted.
 */
export function splitShellCommands(
	shellForm: ShellFormNode,
	sourceText: string,
): ShellCommand[] {
	const commands: ShellCommand[] = [];
	let current: ArgumentNode[] = [];
	let currentRaw: string[] = [];

	/**
	 * Ends the current command, adding it to the list if it has any
	 * tokens, and starts a new one.
	 * @param endsWithSeparator Whether the last token ends with a `;` that
	 * separates commands and must be trimmed from its word.
	 */
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

			/**
			 * Removes a group opener from the first word and a separator
			 * from the last word.
			 * @param word The word to trim.
			 * @param index The index of the word in the command.
			 * @returns The trimmed word.
			 */
			const trim = (word: string, index: number): string => {
				let result = word;

				// Only an unescaped `(` opens a group; `\(cd` is a word.
				if (index === 0 && firstRaw.startsWith("(")) {
					result = result.replace(/^\(+/u, "");
				}

				if (endsWithSeparator && index === tokens.length - 1) {
					result = result.replace(/;(?:#.*)?$/u, "");
				}

				return result;
			};

			commands.push({
				tokens,
				words: tokens.map((token, index) => trim(token.value, index)),
				raw: currentRaw.map(trim),
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
	 * @param value The raw source text of the token.
	 * @returns Whether the token ends with a command separator and whether
	 * a comment starts right after it.
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

		// A `#` starts a comment only at the start of a word: after an
		// unescaped blank. An escaped blank (`word\ #tag`) keeps the `#`
		// inside the word, but `word\  #note` has a second, unescaped
		// blank before it.
		if (
			quote === null &&
			raw.startsWith("#") &&
			(gap === "" ||
				UNESCAPED_TRAILING_BLANK.test(gap.replace(CONTINUATION, "")))
		) {
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
 * @param tokens The tokens to span.
 * @returns The start offset of the first token and the end offset of the
 * last token.
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
