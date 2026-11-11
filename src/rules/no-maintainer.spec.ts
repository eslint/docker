/**
 * @fileoverview Tests for the no-maintainer rule.
 */

import { RuleTester } from "eslint";
import { DockerLanguage } from "../languages/docker-language.js";
import rule from "./no-maintainer.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerLanguage() },
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- plugin shape is validated by ESLint at runtime.
	} as any,
	language: "docker/dockerfile",
});

ruleTester.run("no-maintainer", rule as never, {
	valid: ['LABEL maintainer="jane@example.com"', "FROM node:20\nRUN echo hi"],
	invalid: [
		{
			code: "MAINTAINER jane@example.com",
			output: 'LABEL maintainer="jane@example.com"',
			errors: [
				{
					messageId: "useLabel",
					line: 1,
					column: 1,
					endColumn: 28,
				},
			],
		},
		{
			code: "FROM node:20\nMAINTAINER Jane Doe <jane@example.com>",
			output: 'FROM node:20\nLABEL maintainer="Jane Doe <jane@example.com>"',
			errors: [{ messageId: "useLabel", line: 2 }],
		},
		{
			// Values with double quotes are not autofixed.
			code: 'MAINTAINER "Jane Doe"',
			output: null,
			errors: [{ messageId: "useLabel" }],
		},
		{
			// LABEL would expand variables that MAINTAINER keeps literally.
			code: "MAINTAINER jane$TEAM@example.com",
			output: null,
			errors: [{ messageId: "useLabel" }],
		},
		{
			// A MAINTAINER without a value has nothing to convert.
			code: "MAINTAINER",
			output: null,
			errors: [{ messageId: "useLabel" }],
		},
	],
});
