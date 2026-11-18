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

/** A leading `%NAME%` Windows variable reference. */
const WINDOWS_VARIABLE = /^%[^%\s]+%/u;

/**
 * Removes shell-style quotes anywhere in a WORKDIR operand, the way Docker
 * combines `"/opt/my app"/src` into `/opt/my app/src`. Returns the
 * resulting path and whether its first character came from inside single
 * quotes, where variable references are literal.
 */
function unquote(raw: string): { path: string; literalStart: boolean } {
	let path = "";
	let quote: string | null = null;
	let literalStart = false;

	for (const character of raw) {
		if (quote === null && (character === '"' || character === "'")) {
			quote = character;
		} else if (character === quote) {
			quote = null;
		} else {
			if (path === "") {
				literalStart = quote === "'";
			}

			path += character;
		}
	}

	return { path, literalStart };
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

	create(context) {
		return {
			WorkdirInstruction(node) {
				if (!node.path) {
					return;
				}

				// Remove quotes. Single quotes suppress variable
				// substitution, so their contents are literal.
				const { path, literalStart } = unquote(node.path.value);
				const expands = !literalStart;

				if (path === "") {
					return;
				}

				const isAbsolute =
					path.startsWith("/") ||
					WINDOWS_ABSOLUTE.test(path) ||
					// Variable references cannot be checked.
					(expands &&
						(path.startsWith("$") || WINDOWS_VARIABLE.test(path)));

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
