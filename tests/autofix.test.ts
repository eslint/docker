/**
 * @fileoverview Integration tests for autofixing through the Linter API.
 */

import { describe, expect, it } from "vitest";
import { Linter } from "eslint";
import docker from "../src/index.js";

function fix(code: string, rules: Record<string, unknown>): Linter.FixReport {
	const linter = new Linter();

	return linter.verifyAndFix(
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

describe("autofix", () => {
	it("should uppercase instruction keywords", () => {
		const result = fix("from node:20\nrun echo hi\n", {
			"docker/consistent-instruction-casing": "error",
		});

		expect(result.fixed).toBe(true);
		expect(result.output).toBe("FROM node:20\nRUN echo hi\n");
		expect(result.messages).toEqual([]);
	});

	it("should convert MAINTAINER to a LABEL", () => {
		const result = fix("FROM node:20\nMAINTAINER jane@example.com\n", {
			"docker/no-maintainer": "error",
		});

		expect(result.output).toBe(
			'FROM node:20\nLABEL maintainer="jane@example.com"\n',
		);
	});

	it("should convert ADD to COPY", () => {
		const result = fix("ADD src/ /app/src/\n", {
			"docker/prefer-copy-over-add": "error",
		});

		expect(result.output).toBe("COPY src/ /app/src/\n");
	});

	it("should convert a lone RUN cd to WORKDIR", () => {
		const result = fix("RUN cd /app\n", {
			"docker/no-cd-in-run": "error",
		});

		expect(result.output).toBe("WORKDIR /app\n");
	});

	it("should convert shell form CMD to exec form", () => {
		const result = fix("CMD npm start\n", {
			"docker/prefer-exec-form": "error",
		});

		expect(result.output).toBe('CMD ["npm", "start"]\n');
	});

	it("should apply fixes from multiple rules at once", () => {
		const result = fix(
			[
				"from node:20",
				"maintainer jane",
				"add src/ /app/",
				"cmd npm start",
				"",
			].join("\n"),
			{
				"docker/consistent-instruction-casing": "error",
				"docker/no-maintainer": "error",
				"docker/prefer-copy-over-add": "error",
				"docker/prefer-exec-form": "error",
			},
		);

		expect(result.fixed).toBe(true);
		expect(result.output).toBe(
			[
				"FROM node:20",
				'LABEL maintainer="jane"',
				"COPY src/ /app/",
				'CMD ["npm", "start"]',
				"",
			].join("\n"),
		);
		expect(result.messages).toEqual([]);
	});
});
