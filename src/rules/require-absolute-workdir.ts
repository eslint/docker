/**
 * @fileoverview Rule to require WORKDIR paths to be absolute. Relative
 * paths depend on the previous WORKDIR and break silently when earlier
 * instructions change.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import type { DockerRuleDefinition } from "../types.js";

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/u;

/** A character that can start a variable name after `$`. */
const VARIABLE_START = /^[A-Za-z_{]/u;

/**
 * Removes quotes and Dockerfile escapes anywhere in a WORKDIR operand, the
 * way Docker combines `"/opt/my app"/src` into `/opt/my app/src` and
 * `\/app` into `/app`.
 * @param raw The WORKDIR operand as written.
 * @param escapeCharacter The Dockerfile's escape character, or an empty
 * string to leave escapes unprocessed.
 * @returns The resulting path, and whether it starts with a variable
 * reference that Docker expands: an unescaped `$` outside single quotes,
 * directly followed by a variable name or `{`.
 */
function unquote(
	raw: string,
	escapeCharacter: string,
): { path: string; startsWithVariable: boolean } {
	let path = "";
	let quote: string | null = null;
	let startsWithVariable = false;

	for (let i = 0; i < raw.length; i++) {
		const character = raw[i] as string;

		const next = raw[i + 1];

		if (
			character === escapeCharacter &&
			next !== undefined &&
			(quote === null ||
				// Inside double quotes, the escape character is kept
				// unless it escapes `"`, `$`, or itself.
				(quote === '"' &&
					(next === '"' || next === "$" || next === escapeCharacter)))
		) {
			// The escaped character is literal, including `$`.
			i++;
			path += raw[i];
		} else if (quote === null && (character === '"' || character === "'")) {
			quote = character;
		} else if (character === quote) {
			quote = null;
		} else {
			if (
				path === "" &&
				character === "$" &&
				quote !== "'" &&
				VARIABLE_START.test(raw.slice(i + 1))
			) {
				startsWithVariable = true;
			}

			path += character;
		}
	}

	return { path, startsWithVariable };
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "expectedAbsolute" }> = {
	meta: {
		type: "problem",
		docs: {
			description: "Require `WORKDIR` paths to be absolute",
			recommended: true,
			url: "https://github.com/eslint/docker/blob/main/docs/rules/require-absolute-workdir.md",
		},
		schema: [],
		messages: {
			expectedAbsolute:
				"Use an absolute path for WORKDIR instead of '{{path}}'.",
		},
	},

	/**
	 * Creates the rule's visitor.
	 * @param context The rule context.
	 * @returns A visitor that tracks each stage's platform and checks
	 * WORKDIR instructions.
	 */
	create(context) {
		const { sourceCode } = context;
		const escapeCharacter =
			sourceCode.ast.directives.find(
				directive => directive.name.toLowerCase() === "escape",
			)?.value ?? "\\";

		// Whether the current stage explicitly targets Linux, where a
		// drive letter is an ordinary relative path component.
		let linuxStage = false;

		return {
			/**
			 * Records whether the new stage explicitly targets Linux.
			 * @param node The FROM instruction that starts the stage.
			 */
			FromInstruction(node) {
				const platform = node.flags.find(
					flag => flag.name === "platform",
				);

				linuxStage = /^linux(?:\/|$)/iu.test(platform?.value ?? "");
			},

			/**
			 * Reports a WORKDIR instruction whose path is not absolute.
			 * @param node The WORKDIR instruction to check.
			 */
			WorkdirInstruction(node) {
				if (!node.path) {
					return;
				}

				// Remove quotes and escapes. Single quotes suppress
				// variable substitution, so their contents are literal.
				const { path, startsWithVariable } = unquote(
					node.path.value,
					escapeCharacter,
				);

				// An empty operand (`WORKDIR ""`) keeps the previous working
				// directory, which is as fragile as a relative path.
				const isAbsolute =
					path.startsWith("/") ||
					// Windows paths such as `C:\app` are often written with
					// the default escape character, so also check the
					// operand without escape processing.
					(!linuxStage &&
						(WINDOWS_ABSOLUTE.test(path) ||
							WINDOWS_ABSOLUTE.test(
								unquote(node.path.value, "").path,
							))) ||
					// Variable references cannot be checked.
					startsWithVariable;

				if (!isAbsolute) {
					context.report({
						node: node.path,
						messageId: "expectedAbsolute",
						data: { path },
					});
				}
			},
		};
	},
};

export default rule;
