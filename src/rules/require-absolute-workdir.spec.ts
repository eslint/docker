/**
 * @fileoverview Tests for the require-absolute-workdir rule.
 */

import { RuleTester } from "eslint";
import { DockerLanguage } from "../languages/docker-language.js";
import rule from "./require-absolute-workdir.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerLanguage() },
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- plugin shape is validated by ESLint at runtime.
	} as any,
	language: "docker/dockerfile",
});

ruleTester.run("require-absolute-workdir", rule as never, {
	valid: [
		"WORKDIR /app",
		"WORKDIR /usr/src/app",
		'WORKDIR "/quoted path"',
		// Windows-style absolute paths.
		"WORKDIR C:/app",
		// Variables cannot be checked.
		"WORKDIR $HOME",
		'WORKDIR "$HOME/app"',
		"WORKDIR ${APP_DIR}",
		"WORKDIR %APP_HOME%",
		"WORKDIR",
	],
	invalid: [
		{
			code: "WORKDIR app",
			errors: [
				{
					messageId: "expectedAbsolute",
					data: { path: "app" },
					line: 1,
					column: 9,
					endColumn: 12,
				},
			],
		},
		{
			code: "WORKDIR ./app",
			errors: [{ messageId: "expectedAbsolute" }],
		},
		{
			code: "WORKDIR usr/src/app",
			errors: [{ messageId: "expectedAbsolute" }],
		},
		{
			code: 'WORKDIR "relative dir"',
			errors: [{ messageId: "expectedAbsolute" }],
		},
		{
			// Leading whitespace inside quotes is part of the path.
			code: 'WORKDIR " relative dir"',
			errors: [
				{
					messageId: "expectedAbsolute",
					data: { path: " relative dir" },
				},
			],
		},
		{
			// Single quotes suppress variable substitution.
			code: "WORKDIR '$APP_HOME'",
			errors: [{ messageId: "expectedAbsolute" }],
		},
		{
			// A lone percent sign is not a variable reference.
			code: "WORKDIR %cache",
			errors: [{ messageId: "expectedAbsolute" }],
		},
	],
});
