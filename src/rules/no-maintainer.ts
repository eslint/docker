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

	/**
	 * Creates the rule's visitor.
	 * @param context The rule context.
	 * @returns A visitor that collects the MAINTAINER instructions of each
	 * stage and reports them when the stage ends.
	 */
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
		 * @param node The MAINTAINER instruction.
		 * @returns The text from the first to the last argument, or an
		 * empty string if there are no arguments.
		 */
		function maintainerText(node: MaintainerInstructionNode): string {
			const first = node.arguments[0];
			const last = node.arguments.at(-1) as ArgumentNode | undefined;

			return first && last
				? sourceCode.text.slice(first.start, last.end)
				: "";
		}

		return {
			/**
			 * Ends the previous stage and starts a new one.
			 */
			FromInstruction() {
				reportStage();
				stageHasMaintainerLabel = false;
			},

			/**
			 * Ends the last stage.
			 */
			"Dockerfile:exit"() {
				reportStage();
			},

			/**
			 * Records whether the current stage sets a `maintainer` label.
			 * @param node The LABEL instruction to check.
			 */
			LabelInstruction(node) {
				if (node.pairs.some(pair => pair.key.value === "maintainer")) {
					stageHasMaintainerLabel = true;
				}
			},

			/**
			 * Records a MAINTAINER instruction and whether it can be
			 * converted to a LABEL safely.
			 * @param node The MAINTAINER instruction.
			 */
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
