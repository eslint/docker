/**
 * @fileoverview Rule to disallow multiple CMD, ENTRYPOINT, or HEALTHCHECK
 * instructions in the same build stage: only the last one takes effect.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import type { DockerRuleDefinition, InstructionNode } from "../types.js";

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const SINGLETON_KEYWORDS = new Set(["CMD", "ENTRYPOINT", "HEALTHCHECK"]);

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{ MessageIds: "duplicateInstruction" }> = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow multiple `CMD`, `ENTRYPOINT`, or `HEALTHCHECK` instructions in the same stage",
			recommended: true,
			url: "https://github.com/eslint/docker/blob/main/docs/rules/no-duplicate-instructions.md",
		},
		schema: [],
		messages: {
			duplicateInstruction:
				"Multiple {{keyword}} instructions in the same stage; only the last one takes effect.",
		},
	},

	create(context) {
		return {
			Dockerfile(node) {
				let seen = new Map<string, InstructionNode[]>();

				const flush = (): void => {
					for (const [keyword, instructions] of seen) {
						for (const instruction of instructions.slice(0, -1)) {
							context.report({
								node: instruction,
								messageId: "duplicateInstruction",
								data: { keyword },
							});
						}
					}

					seen = new Map();
				};

				for (const instruction of node.body) {
					if (instruction.type === "FromInstruction") {
						flush();
						continue;
					}

					if (SINGLETON_KEYWORDS.has(instruction.keyword)) {
						const group = seen.get(instruction.keyword) ?? [];

						group.push(instruction);
						seen.set(instruction.keyword, group);
					}
				}

				flush();
			},
		};
	},
};

export default rule;
