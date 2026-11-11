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
			// The keyword in the source is the first whitespace-delimited
			// word. Its length can differ from the normalized keyword's
			// (for example, "straße" normalizes to "STRASSE").
			const written = /^\S*/u.exec(
				sourceCode.text.slice(node.start, node.end),
			)?.[0] as string;
			const keywordEnd = node.start + written.length;

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
