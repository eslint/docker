/**
 * @fileoverview Tests for the no-duplicate-instructions rule.
 */

import { RuleTester } from "eslint";
import { DockerLanguage } from "../languages/docker-language.js";
import rule from "./no-duplicate-instructions.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerLanguage() },
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- plugin shape is validated by ESLint at runtime.
	} as any,
	language: "docker/dockerfile",
});

ruleTester.run("no-duplicate-instructions", rule as never, {
	valid: [
		'FROM node:20\nCMD ["node", "app.js"]',
		'FROM node:20\nENTRYPOINT ["node"]\nCMD ["app.js"]',
		// One CMD per stage is fine.
		'FROM node:20 AS build\nCMD ["a"]\nFROM node:20\nCMD ["b"]',
		"FROM node:20\nRUN echo one\nRUN echo two",
		"FROM node:20\nHEALTHCHECK CMD curl -f http://localhost/",
	],
	invalid: [
		{
			code: 'FROM node:20\nCMD ["a"]\nCMD ["b"]',
			errors: [
				{
					messageId: "duplicateInstruction",
					data: { keyword: "CMD" },
					line: 2,
					column: 1,
				},
			],
		},
		{
			code: 'FROM node:20\nENTRYPOINT ["a"]\nENTRYPOINT ["b"]\nENTRYPOINT ["c"]',
			errors: [
				{ messageId: "duplicateInstruction", line: 2 },
				{ messageId: "duplicateInstruction", line: 3 },
			],
		},
		{
			code: "FROM node:20\nHEALTHCHECK CMD a\nHEALTHCHECK CMD b",
			errors: [{ messageId: "duplicateInstruction", line: 2 }],
		},
		{
			// Duplicates inside a single stage of a multi-stage build.
			code: 'FROM node:20 AS build\nCMD ["a"]\nFROM node:20\nCMD ["b"]\nCMD ["c"]',
			errors: [{ messageId: "duplicateInstruction", line: 4 }],
		},
	],
});
