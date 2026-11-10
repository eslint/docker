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

				// Remove surrounding quotes, if any. A quoted path with
				// spaces is split across tokens, so the quotes are stripped
				// independently.
				const path = node.path.value
					.replace(/^["']/u, "")
					.replace(/["']$/u, "");

				if (path === "") {
					return;
				}

				const isAbsolute =
					path.startsWith("/") ||
					WINDOWS_ABSOLUTE.test(path) ||
					// Variable references cannot be checked.
					path.startsWith("$") ||
					path.startsWith("%");

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
