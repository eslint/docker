/**
 * @fileoverview Tests for the consistent-instruction-casing rule.
 */

import { RuleTester } from "eslint";
import { DockerLanguage } from "../languages/docker-language.js";
import rule from "./consistent-instruction-casing.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerLanguage() },
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- plugin shape is validated by ESLint at runtime.
	} as any,
	language: "docker/dockerfile",
});

ruleTester.run("consistent-instruction-casing", rule as never, {
	valid: [
		"FROM node:20",
		"FROM node:20 AS base\nRUN echo hi",
		'CMD ["node", "app.js"]',
		"# a comment\nWORKDIR /app",
		"ONBUILD COPY . /app",
	],
	invalid: [
		{
			code: "from node:20",
			output: "FROM node:20",
			errors: [
				{
					messageId: "expectedUppercase",
					data: { actual: "from", expected: "FROM" },
					line: 1,
					column: 1,
					endColumn: 5,
				},
			],
		},
		{
			code: "FROM node:20\nrun echo hi",
			output: "FROM node:20\nRUN echo hi",
			errors: [
				{
					messageId: "expectedUppercase",
					line: 2,
					column: 1,
					endColumn: 4,
				},
			],
		},
		{
			code: "Workdir /app",
			output: "WORKDIR /app",
			errors: [{ messageId: "expectedUppercase" }],
		},
		{
			// Both the ONBUILD keyword and its trigger are checked.
			code: "onbuild copy . /app",
			output: "ONBUILD COPY . /app",
			errors: [
				{ messageId: "expectedUppercase", column: 1, endColumn: 8 },
				{ messageId: "expectedUppercase", column: 9, endColumn: 13 },
			],
		},
		{
			// Unknown instructions are still normalized.
			code: "bogus one two",
			output: "BOGUS one two",
			errors: [{ messageId: "expectedUppercase" }],
		},
	],
});
