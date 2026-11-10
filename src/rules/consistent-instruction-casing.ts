/**
 * @fileoverview Rule to require instruction keywords to be written in
 * uppercase, per the Dockerfile format conventions.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import { INSTRUCTION_TYPES } from "../types.js";
import type {
	DockerNode,
	DockerRuleDefinition,
	DockerRuleVisitor,
	InstructionNode,
} from "../types.js";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "expectedUppercase" }> = {
	meta: {
		type: "layout",
		docs: {
			description: "Require instruction keywords to be uppercase",
			recommended: true,
			url: "https://github.com/eslint/docker/blob/main/docs/rules/consistent-instruction-casing.md",
		},
		fixable: "code",
		schema: [],
		messages: {
			expectedUppercase:
				"Instruction keyword '{{actual}}' should be written as '{{expected}}'.",
		},
	},

	create(context) {
		const { sourceCode } = context;

		function check(node: InstructionNode): void {
			const keywordEnd = node.start + node.keyword.length;
			const written = sourceCode.text.slice(node.start, keywordEnd);

			if (written === node.keyword) {
				return;
			}

			context.report({
				loc: sourceCode.getLoc({
					start: node.start,
					end: keywordEnd,
				} as DockerNode),
				messageId: "expectedUppercase",
				data: { actual: written, expected: node.keyword },
				fix: fixer =>
					fixer.replaceTextRange(
						[node.start, keywordEnd],
						node.keyword,
					),
			});
		}

		return Object.fromEntries(
			INSTRUCTION_TYPES.map(type => [type, check]),
		) as DockerRuleVisitor;
	},
};

export default rule;
