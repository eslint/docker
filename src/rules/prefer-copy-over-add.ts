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

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "useCopy" }> = {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Require COPY instead of ADD for local files and directories",
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
		return {
			AddInstruction(node) {
				if (node.sources.length === 0) {
					return;
				}

				// These flags only exist on ADD.
				if (
					node.flags.some(
						flag =>
							flag.name === "checksum" ||
							flag.name === "keep-git-dir",
					)
				) {
					return;
				}

				// ADD is legitimately needed for URLs and archives, and
				// variable sources cannot be checked.
				if (
					node.sources.some(
						source =>
							URL_SOURCE.test(source.value) ||
							GIT_SOURCE.test(source.value) ||
							ARCHIVE_SOURCE.test(source.value) ||
							source.value.includes("$"),
					)
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
