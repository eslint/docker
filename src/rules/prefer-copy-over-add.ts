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
/** An SCP-style Git reference such as `deploy@example.org:team/repo.git`. */
const GIT_SOURCE = /^[\w.-]+@[\w.-]+:/u;
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

const rule: DockerRuleDefinition<{
	MessageIds: "useCopy" | "replaceWithCopy";
}> = {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Require `COPY` instead of `ADD` for local files and directories",
			recommended: true,
			url: "https://github.com/eslint/docker/blob/main/docs/rules/prefer-copy-over-add.md",
		},
		hasSuggestions: true,
		schema: [],
		messages: {
			useCopy: "Use COPY instead of ADD for local files and directories.",
			replaceWithCopy: "Replace ADD with COPY.",
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
						// `archive.tar.gz/.` and `archive.tar.gz/` name the
						// same file as `archive.tar.gz`.
						const path = value.replace(/(?:\/+\.?)+$/u, "");

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

				// Docker detects archives by their contents, not their
				// names, so a local source without an archive extension
				// may still be extracted by ADD. The replacement is
				// therefore offered as a suggestion rather than a fix. A
				// keyword split by a line continuation is not contiguous,
				// so it gets no suggestion.
				const keywordEnd = node.start + node.keyword.length;
				const keywordIsContiguous =
					sourceCode.text
						.slice(node.start, keywordEnd)
						.toUpperCase() === node.keyword;

				context.report({
					node,
					messageId: "useCopy",
					suggest: keywordIsContiguous
						? [
								{
									messageId: "replaceWithCopy",
									fix: fixer =>
										fixer.replaceTextRange(
											[node.start, keywordEnd],
											"COPY",
										),
								},
							]
						: [],
				});
			},
		};
	},
};

export default rule;
