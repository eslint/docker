/**
 * @fileoverview Integration tests running the plugin through the ESLint
 * Linter API with the recommended configuration.
 */

import { describe, expect, it } from "vitest";
import { Linter } from "eslint";
import docker from "../src/index.js";

const baseConfig = {
	files: ["**/Dockerfile"],
	plugins: { docker },
	language: "docker/dockerfile",
} as const;

function lint(
	code: string,
	rules: Record<string, unknown> = {},
): Linter.LintMessage[] {
	const linter = new Linter();

	return linter.verify(
		code,
		[
			{
				...baseConfig,
				rules: rules as never,
			},
		] as never,
		"Dockerfile",
	);
}

describe("plugin integration", () => {
	it("should lint a clean Dockerfile without messages", () => {
		const messages = lint(
			[
				"FROM node:20-alpine AS base",
				"WORKDIR /app",
				"COPY package.json package-lock.json ./",
				"RUN npm ci",
				"COPY . .",
				"USER node",
				'CMD ["node", "server.js"]',
				"",
			].join("\n"),
			{
				"docker/require-image-tag": "error",
				"docker/require-absolute-workdir": "error",
				"docker/prefer-copy-over-add": "error",
				"docker/prefer-exec-form": "error",
				"docker/no-cd-in-run": "error",
			},
		);

		expect(messages).toEqual([]);
	});

	it("should report rule violations with correct positions", () => {
		const messages = lint("FROM node\n", {
			"docker/require-image-tag": "error",
		});

		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			ruleId: "docker/require-image-tag",
			line: 1,
			column: 6,
			endLine: 1,
			endColumn: 10,
			severity: 2,
		});
	});

	it("should not produce fatal errors for malformed input", () => {
		const messages = lint("]]] this is not really a dockerfile [[[\n");

		expect(messages.filter(message => message.fatal)).toEqual([]);
	});

	it("should run multiple rules together", () => {
		const messages = lint(
			[
				"FROM ubuntu:latest",
				"MAINTAINER jane@example.com",
				"RUN sudo apt-get update && apt-get upgrade -y",
				"RUN cd /opt && make",
				"ADD src/ /app/src/",
				"WORKDIR app",
				"",
			].join("\n"),
			{
				"docker/require-image-tag": "error",
				"docker/no-maintainer": "error",
				"docker/no-sudo": "error",
				"docker/no-apt-get-upgrade": "error",
				"docker/no-cd-in-run": "error",
				"docker/prefer-copy-over-add": "error",
				"docker/require-absolute-workdir": "error",
			},
		);
		const ruleIds = new Set(messages.map(message => message.ruleId));

		expect(ruleIds).toEqual(
			new Set([
				"docker/require-image-tag",
				"docker/no-maintainer",
				"docker/no-sudo",
				"docker/no-apt-get-upgrade",
				"docker/no-cd-in-run",
				"docker/prefer-copy-over-add",
				"docker/require-absolute-workdir",
			]),
		);
	});
});

describe("recommended configuration", () => {
	it("should be usable directly with the Linter", () => {
		const linter = new Linter();
		const messages = linter.verify(
			"FROM node\n",
			[docker.configs.recommended] as never,
			"Dockerfile",
		);

		expect(
			messages.some(
				message => message.ruleId === "docker/require-image-tag",
			),
		).toBe(true);
	});

	it("should apply to Dockerfile variants", () => {
		const linter = new Linter();

		for (const filename of [
			"Dockerfile",
			"Dockerfile.dev",
			"app.dockerfile",
			"Containerfile",
			"services/api/Dockerfile",
		]) {
			const messages = linter.verify(
				"FROM node\n",
				[docker.configs.recommended] as never,
				filename,
			);

			// Unmatched files also produce a message ("No matching
			// configuration found"), so check for a rule diagnostic.
			expect(
				messages.map(message => message.ruleId),
				filename,
			).toContain("docker/require-image-tag");
		}
	});

	it("should not apply to other files", () => {
		const linter = new Linter();

		// Files that do not match the config's patterns fall back to the
		// default JavaScript language, so use valid JavaScript here.
		const messages = linter.verify(
			'const image = "FROM node";\n',
			[docker.configs.recommended] as never,
			"script.js",
		);

		expect(messages).toEqual([]);
	});

	it("should flag a Dockerfile with typical hadolint findings", () => {
		const linter = new Linter();
		const code = [
			"from ubuntu",
			"MAINTAINER jane@example.com",
			"RUN cd /tmp && sudo make",
			"CMD npm start",
			"",
		].join("\n");
		const messages = linter.verify(
			code,
			[docker.configs.recommended] as never,
			"Dockerfile",
		);
		const ruleIds = new Set(messages.map(message => message.ruleId));

		expect(ruleIds).toContain("docker/consistent-instruction-casing");
		expect(ruleIds).toContain("docker/require-image-tag");
		expect(ruleIds).toContain("docker/no-maintainer");
		expect(ruleIds).toContain("docker/no-cd-in-run");
		expect(ruleIds).toContain("docker/no-sudo");
		expect(ruleIds).toContain("docker/prefer-exec-form");
	});
});
