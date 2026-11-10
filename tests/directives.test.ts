/**
 * @fileoverview Integration tests for inline configuration comments.
 */

import { describe, expect, it } from "vitest";
import { Linter } from "eslint";
import docker from "../src/index.js";

function lint(
	code: string,
	rules: Record<string, unknown>,
): Linter.LintMessage[] {
	const linter = new Linter();

	return linter.verify(
		code,
		[
			{
				files: ["**/Dockerfile"],
				plugins: { docker },
				language: "docker/dockerfile",
				rules: rules as never,
			},
		] as never,
		"Dockerfile",
	);
}

describe("disable directives", () => {
	it("should honor eslint-disable-next-line", () => {
		const messages = lint(
			"# eslint-disable-next-line docker/no-maintainer\nMAINTAINER jane\n",
			{ "docker/no-maintainer": "error" },
		);

		expect(messages).toEqual([]);
	});

	it("should not treat # after an instruction as a directive", () => {
		// Dockerfile comments must start at the beginning of a line, so a
		// trailing # is part of the arguments and eslint-disable-line
		// cannot be used inline. Use eslint-disable-next-line instead.
		const messages = lint(
			"MAINTAINER jane # eslint-disable-line docker/no-maintainer\n",
			{ "docker/no-maintainer": "error" },
		);

		expect(messages).toHaveLength(1);
		expect(messages[0]?.ruleId).toBe("docker/no-maintainer");
	});

	it("should honor eslint-disable/eslint-enable blocks", () => {
		const messages = lint(
			[
				"# eslint-disable docker/require-image-tag",
				"FROM node",
				"# eslint-enable docker/require-image-tag",
				"FROM ubuntu",
				"",
			].join("\n"),
			{ "docker/require-image-tag": "error" },
		);

		expect(messages).toHaveLength(1);
		expect(messages[0]?.line).toBe(4);
	});

	it("should only disable the named rule", () => {
		const messages = lint(
			"# eslint-disable-next-line docker/no-sudo\nMAINTAINER jane\n",
			{ "docker/no-maintainer": "error" },
		);
		const ruleMessages = messages.filter(
			message => message.ruleId !== null,
		);

		expect(ruleMessages).toHaveLength(1);
		expect(ruleMessages[0]?.ruleId).toBe("docker/no-maintainer");
	});

	it("should report unused disable directives when asked", () => {
		const linter = new Linter();
		const messages = linter.verify(
			"# eslint-disable-next-line docker/no-maintainer\nFROM node:20\n",
			[
				{
					files: ["**/Dockerfile"],
					plugins: { docker },
					language: "docker/dockerfile",
					linterOptions: {
						reportUnusedDisableDirectives: "error",
					},
					rules: { "docker/no-maintainer": "error" },
				},
			] as never,
			"Dockerfile",
		);

		expect(messages).toHaveLength(1);
		expect(messages[0]?.message).toMatch(/Unused eslint-disable/u);
	});
});

describe("inline rule configuration", () => {
	it("should apply severity from eslint comments", () => {
		const messages = lint(
			'# eslint docker/no-maintainer: "warn"\nMAINTAINER jane\n',
			{ "docker/no-maintainer": "error" },
		);

		expect(messages).toHaveLength(1);
		expect(messages[0]?.severity).toBe(1);
	});
});
