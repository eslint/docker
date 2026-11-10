/**
 * @fileoverview Tests for the DockerSourceCode class.
 */

import { describe, expect, it } from "vitest";
import { DockerSourceCode } from "./docker-source-code.js";
import { parseDocker } from "../parser/parse.js";
import type {
	DockerNode,
	FromInstructionNode,
	RunInstructionNode,
	ShellFormNode,
} from "../types.js";

function createSourceCode(text: string): DockerSourceCode {
	const { ast } = parseDocker(text);

	return new DockerSourceCode({ text, ast });
}

describe("DockerSourceCode", () => {
	describe("getLoc and getRange", () => {
		it("should derive positions from start/end offsets", () => {
			const text = "FROM node:20\nRUN echo hi\n";
			const sourceCode = createSourceCode(text);
			const run = sourceCode.ast.body[1] as RunInstructionNode;

			expect(sourceCode.getRange(run)).toEqual([13, 24]);
			expect(sourceCode.getLoc(run)).toEqual({
				start: { line: 2, column: 1 },
				end: { line: 2, column: 12 },
			});
		});

		it("should locate nodes in the middle of a line", () => {
			const text = "FROM node:20 AS base\n";
			const sourceCode = createSourceCode(text);
			const from = sourceCode.ast.body[0] as FromInstructionNode;
			const alias = from.alias as DockerNode;

			expect(sourceCode.getRange(alias)).toEqual([16, 20]);
			expect(sourceCode.getLoc(alias)).toEqual({
				start: { line: 1, column: 17 },
				end: { line: 1, column: 21 },
			});
		});

		it("should span multiple lines for continued instructions", () => {
			const text = "RUN echo one && \\\n    echo two\n";
			const sourceCode = createSourceCode(text);
			const run = sourceCode.ast.body[0] as RunInstructionNode;
			const loc = sourceCode.getLoc(run);

			expect(loc.start.line).toBe(1);
			expect(loc.end.line).toBe(2);
		});
	});

	describe("traverse", () => {
		it("should visit nodes with enter and exit phases", () => {
			const sourceCode = createSourceCode("FROM node:20 AS base\n");
			const steps = [...sourceCode.traverse()];
			const visits = steps.map(step => {
				const target = step.target as DockerNode;

				return `${step.phase === 1 ? "enter" : "exit"}:${target.type}`;
			});

			expect(visits).toEqual([
				"enter:Dockerfile",
				"enter:FromInstruction",
				"enter:ImageReference",
				"exit:ImageReference",
				"enter:StageName",
				"exit:StageName",
				"exit:FromInstruction",
				"exit:Dockerfile",
			]);
		});

		it("should return cached steps on repeat traversal", () => {
			const sourceCode = createSourceCode("FROM node:20\n");
			const first = [...sourceCode.traverse()];
			const second = [...sourceCode.traverse()];

			expect(second).toEqual(first);
		});

		it("should visit shell form tokens", () => {
			const sourceCode = createSourceCode("RUN echo hi\n");
			const types = [...sourceCode.traverse()]
				.filter(step => step.phase === 1)
				.map(step => (step.target as DockerNode).type);

			expect(types).toEqual([
				"Dockerfile",
				"RunInstruction",
				"ShellForm",
				"Argument",
				"Argument",
			]);
		});
	});

	describe("getParent", () => {
		it("should return the parent of a nested node", () => {
			const sourceCode = createSourceCode("RUN echo hi\n");
			const run = sourceCode.ast.body[0] as RunInstructionNode;
			const command = run.command as ShellFormNode;
			const argument = command.arguments[0] as DockerNode;

			expect(sourceCode.getParent(argument)).toBe(command);
			expect(sourceCode.getParent(command)).toBe(run);
			expect(sourceCode.getParent(run)).toBe(sourceCode.ast);
		});

		it("should return undefined for the root node", () => {
			const sourceCode = createSourceCode("FROM node:20\n");

			expect(sourceCode.getParent(sourceCode.ast)).toBeUndefined();
		});
	});

	describe("comments", () => {
		it("should expose the comments from the ast", () => {
			const sourceCode = createSourceCode("# one\nFROM node:20\n# two\n");

			expect(sourceCode.comments.map(comment => comment.text)).toEqual([
				"one",
				"two",
			]);
		});
	});

	describe("getInlineConfigNodes", () => {
		it("should return only eslint configuration comments", () => {
			const sourceCode = createSourceCode(
				[
					"# plain comment",
					"# eslint-disable-next-line docker/no-maintainer",
					"MAINTAINER jane",
					"# eslint docker/no-sudo: 'warn'",
					"",
				].join("\n"),
			);
			const nodes = sourceCode.getInlineConfigNodes();

			expect(nodes).toHaveLength(2);
			expect(nodes[0]?.text).toMatch(/^eslint-disable-next-line/u);

			// The result is cached.
			expect(sourceCode.getInlineConfigNodes()).toBe(nodes);
		});
	});

	describe("getDisableDirectives", () => {
		it("should parse disable directives with rule ids", () => {
			const sourceCode = createSourceCode(
				"# eslint-disable-next-line docker/no-maintainer -- legacy\nMAINTAINER jane\n",
			);
			const { directives, problems } = sourceCode.getDisableDirectives();

			expect(problems).toEqual([]);
			expect(directives).toHaveLength(1);
			expect(directives[0]).toMatchObject({
				type: "disable-next-line",
				value: "docker/no-maintainer",
				justification: "legacy",
			});
		});

		it("should ignore comments that are not directives", () => {
			const sourceCode = createSourceCode(
				"# just a note\nFROM node:20\n",
			);
			const { directives } = sourceCode.getDisableDirectives();

			expect(directives).toEqual([]);
		});
	});

	describe("applyInlineConfig", () => {
		it("should collect rule configurations from eslint comments", () => {
			const sourceCode = createSourceCode(
				'# eslint docker/no-sudo: "warn"\nFROM node:20\n',
			);
			const { configs, problems } = sourceCode.applyInlineConfig();

			expect(problems).toEqual([]);
			expect(configs).toHaveLength(1);
			expect(configs[0]?.config.rules).toEqual({
				"docker/no-sudo": "warn",
			});
		});

		it("should report malformed configuration comments", () => {
			const sourceCode = createSourceCode(
				"# eslint docker/no-sudo: oops(\nFROM node:20\n",
			);
			const { configs, problems } = sourceCode.applyInlineConfig();

			expect(configs).toEqual([]);
			expect(problems).toHaveLength(1);
			expect(problems[0]?.ruleId).toBeNull();
		});
	});
});
