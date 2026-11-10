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
	],
});
