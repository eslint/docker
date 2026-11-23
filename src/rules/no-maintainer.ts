/**
 * @fileoverview Rule to disallow the deprecated MAINTAINER instruction in
 * favor of a `maintainer` LABEL.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import type {
	ArgumentNode,
	DockerRuleDefinition,
	MaintainerInstructionNode,
} from "../types.js";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "useLabel" }> = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow the deprecated `MAINTAINER` instruction",
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

		// Whether the current stage already sets a `maintainer` label,
		// which the fix would overwrite.
		let stageHasMaintainerLabel = false;

		// The MAINTAINER instructions of the current stage. Each one
		// overwrites the author set by the previous one, so only the last
		// can be converted without changing the image's metadata.
		let stageMaintainers: {
			node: MaintainerInstructionNode;
			canFix: boolean;
		}[] = [];

		/**
		 * Reports the MAINTAINER instructions of the stage that just ended,
		 * offering a fix for the last one only.
		 */
		function reportStage(): void {
			stageMaintainers.forEach(({ node, canFix }, index) => {
				const isLast = index === stageMaintainers.length - 1;

				context.report({
					node,
					messageId: "useLabel",
					fix:
						canFix && isLast
							? fixer =>
									fixer.replaceTextRange(
										[node.start, node.end],
										`LABEL maintainer="${maintainerText(node)}"`,
									)
							: undefined,
				});
			});

			stageMaintainers = [];
		}

		/**
		 * Returns the source text of a MAINTAINER instruction's value.
		 */
		function maintainerText(node: MaintainerInstructionNode): string {
			const first = node.arguments[0];
			const last = node.arguments.at(-1) as ArgumentNode | undefined;

			return first && last
				? sourceCode.text.slice(first.start, last.end)
				: "";
		}

		return {
			FromInstruction() {
				reportStage();
				stageHasMaintainerLabel = false;
			},

			"Dockerfile:exit"() {
				reportStage();
			},

			LabelInstruction(node) {
				if (node.pairs.some(pair => pair.key.value === "maintainer")) {
					stageHasMaintainerLabel = true;
				}
			},

			MaintainerInstruction(node) {
				const argsText = maintainerText(node);

				// Only fix simple single-line values without quoting
				// concerns. MAINTAINER keeps `$` and escape characters
				// literally, but LABEL expands variables even inside
				// double quotes and decodes escapes. A `# escape=`
				// directive can make a backtick the escape character.
				// Docker also consumes a leading `--` delimiter and trims
				// boundary whitespace (including non-ASCII spaces), which
				// would become label data inside the quotes.
				const canFix =
					argsText !== "" &&
					!/[\n\r"\\$`]/u.test(argsText) &&
					argsText === argsText.trim() &&
					!/^--(?:\s|$)/u.test(argsText) &&
					!stageHasMaintainerLabel;

				stageMaintainers.push({ node, canFix });
			},
		};
	},
};

export default rule;
