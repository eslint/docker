/**
 * @fileoverview Rule to prefer COPY over ADD for local files and
 * directories. ADD is only needed for remote URLs and automatic archive
 * extraction.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import type { DockerRuleDefinition } from "../types.js";

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const URL_SOURCE = /^[a-z][a-z0-9+.-]*:\/\//iu;
const GIT_SOURCE = /^git@/iu;
const ARCHIVE_SOURCE = /\.(?:tar|tgz|txz|tbz2?|tar\.(?:gz|bz2|xz|zst))$/iu;

/**
 * Sources whose meaning depends on expansion or quoting: variables,
 * wildcards, and quotes.
 */
const UNRESOLVED_SOURCE = /[$*?[\]"']/u;

/** Flags that COPY does not support. */
const ADD_ONLY_FLAGS = new Set(["checksum", "keep-git-dir", "unpack"]);

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "useCopy" }> = {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Require `COPY` instead of `ADD` for local files and directories",
			recommended: true,
			url: "https://github.com/eslint/docker/blob/main/docs/rules/prefer-copy-over-add.md",
		},
		fixable: "code",
		schema: [],
		messages: {
			useCopy: "Use COPY instead of ADD for local files and directories.",
		},
	},

	create(context) {
		const { sourceCode } = context;

		return {
			AddInstruction(node) {
				if (node.sources.length === 0) {
					return;
				}

				// These flags only exist on ADD.
				if (node.flags.some(flag => ADD_ONLY_FLAGS.has(flag.name))) {
					return;
				}

				// ADD is legitimately needed for URLs and archives. Sources
				// that cannot be classified from their literal text
				// (variables, wildcards, quoting, and escapes) are skipped.
				if (
					node.sources.some(source => {
						const { value } = source;
						const path = value.replace(/\/+$/u, "");

						return (
							URL_SOURCE.test(value) ||
							GIT_SOURCE.test(value) ||
							ARCHIVE_SOURCE.test(path) ||
							UNRESOLVED_SOURCE.test(value) ||
							sourceCode.text
								.slice(source.start, source.end)
								.includes("\\")
						);
					})
				) {
					return;
				}

				context.report({
					node,
					messageId: "useCopy",
					fix: fixer =>
						fixer.replaceTextRange(
							[node.start, node.start + 3],
							"COPY",
						),
				});
			},
		};
	},
};

export default rule;
