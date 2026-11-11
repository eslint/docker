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

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "expectedAbsolute" }> = {
	meta: {
		type: "problem",
		docs: {
			description: "Require WORKDIR paths to be absolute",
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

				// Remove surrounding quotes, if any. Single quotes suppress
				// variable substitution, so their contents are literal.
				const raw = node.path.value;
				const quote = /^(["'])[\s\S]*\1$/u.exec(raw)?.[1];
				const path = quote ? raw.slice(1, -1) : raw;
				const expands = quote !== "'";

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
