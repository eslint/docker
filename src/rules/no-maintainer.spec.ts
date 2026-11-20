/**
 * @fileoverview Tests for the no-maintainer rule.
 */

import { RuleTester } from "eslint";
import { DockerFileLanguage } from "../languages/docker-language.js";
import rule from "./no-maintainer.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerFileLanguage() },
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
			// LABEL would decode the doubled escape character.
			code: "# escape=`\nFROM scratch\nMAINTAINER Jane``Doe",
			output: null,
			errors: [{ messageId: "useLabel" }],
		},
		{
			// Docker consumes the -- delimiter, so it is not part of the value.
			code: "MAINTAINER -- Jane",
			output: null,
			errors: [{ messageId: "useLabel" }],
		},
		{
			// Docker trims the trailing non-breaking space.
			code: "MAINTAINER Jane ",
			output: null,
			errors: [{ messageId: "useLabel" }],
		},
		{
			// The fix would overwrite an existing maintainer label.
			code: "FROM node:20\nLABEL maintainer=release-team\nMAINTAINER Jane",
			output: null,
			errors: [{ messageId: "useLabel" }],
		},
		{
			// A maintainer label in an earlier stage does not block the fix.
			code: "FROM node:20\nLABEL maintainer=team\nFROM node:20\nMAINTAINER Jane",
			output: 'FROM node:20\nLABEL maintainer=team\nFROM node:20\nLABEL maintainer="Jane"',
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
