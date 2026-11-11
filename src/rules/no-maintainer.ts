/**
 * @fileoverview Rule to disallow the deprecated MAINTAINER instruction in
 * favor of a `maintainer` LABEL.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import type { ArgumentNode, DockerRuleDefinition } from "../types.js";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "useLabel" }> = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow the deprecated MAINTAINER instruction",
			recommended: true,
			url: "https://github.com/eslint/docker/blob/main/docs/rules/no-maintainer.md",
		},
		fixable: "code",
		schema: [],
		messages: {
			useLabel:
				"MAINTAINER is deprecated; use 'LABEL maintainer=\"...\"' instead.",
		},
	},

	create(context) {
		const { sourceCode } = context;

		return {
			MaintainerInstruction(node) {
				const first = node.arguments[0];
				const last = node.arguments.at(-1) as ArgumentNode | undefined;
				const argsText =
					first && last
						? sourceCode.text.slice(first.start, last.end)
						: "";

				// Only fix simple single-line values without quoting
				// concerns. MAINTAINER keeps `$` literally, but LABEL
				// expands variables even inside double quotes.
				const canFix = argsText !== "" && !/[\n\r"\\$]/u.test(argsText);

				context.report({
					node,
					messageId: "useLabel",
					fix: canFix
						? fixer =>
								fixer.replaceTextRange(
									[node.start, node.end],
									`LABEL maintainer="${argsText}"`,
								)
						: undefined,
				});
			},
		};
	},
};

export default rule;
