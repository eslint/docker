/**
 * @fileoverview Type-level tests for the syntax tree definitions.
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import { INSTRUCTION_TYPES } from "./types.js";
import type {
	DockerNode,
	DockerRuleDefinition,
	DockerfileNode,
	FromInstructionNode,
	InstructionNode,
	ShellFormNode,
} from "./types.js";

describe("types", () => {
	it("should type Dockerfile nodes", () => {
		const dockerfile: DockerfileNode = {
			type: "Dockerfile",
			start: 0,
			end: 0,
			body: [],
			comments: [],
			directives: [],
		};

		expectTypeOf(dockerfile.type).toEqualTypeOf<"Dockerfile">();
		expectTypeOf(dockerfile.body).toEqualTypeOf<InstructionNode[]>();
		expectTypeOf(dockerfile).toMatchTypeOf<DockerNode>();
	});

	it("should type FROM nodes as instructions", () => {
		expectTypeOf<FromInstructionNode>().toMatchTypeOf<InstructionNode>();
		expectTypeOf<FromInstructionNode["keyword"]>().toEqualTypeOf<"FROM">();
	});

	it("should discriminate command bodies by type", () => {
		const shellForm = {
			type: "ShellForm",
			start: 0,
			end: 1,
			arguments: [],
		} as const;

		expectTypeOf(shellForm).toMatchTypeOf<ShellFormNode>();
	});

	it("should type rule definitions", () => {
		expectTypeOf<
			DockerRuleDefinition<{ MessageIds: "oops" }>
		>().toHaveProperty("create");
	});

	it("should list every instruction node type exactly once", () => {
		expect(INSTRUCTION_TYPES).toHaveLength(new Set(INSTRUCTION_TYPES).size);
		expect(INSTRUCTION_TYPES).toContain("FromInstruction");
		expect(INSTRUCTION_TYPES).toContain("GenericInstruction");
		expect(
			INSTRUCTION_TYPES.every(type => type.endsWith("Instruction")),
		).toBe(true);
	});
});
