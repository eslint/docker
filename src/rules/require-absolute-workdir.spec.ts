/**
 * @fileoverview Tests for the require-absolute-workdir rule.
 */

import { RuleTester } from "eslint";
import { DockerFileLanguage } from "../languages/docker-language.js";
import rule from "./require-absolute-workdir.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerFileLanguage() },
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
		// Quoted prefixes combine with the rest of the operand.
		'WORKDIR "/opt/my app"/src',
		"WORKDIR '/opt'/src",
		'WORKDIR ""/app',
		// Windows-style absolute paths.
		"WORKDIR C:/app",
		// Variables cannot be checked.
		"WORKDIR $HOME",
		'WORKDIR "$HOME/app"',
		"WORKDIR ${APP_DIR}",
		"WORKDIR",
		// Dockerfile escapes are removed before the check.
		"WORKDIR \\/app",
		"# escape=`\nFROM scratch\nWORKDIR `/app",
		// Comment lines inside a continuation are not part of the path.
		'WORKDIR ""\\\n# comment\n/app',
		// Drive letters are absolute when the stage may target Windows.
		"FROM --platform=windows/amd64 example/app\nWORKDIR C:/app",
		"WORKDIR C:\\app",
	],
	invalid: [
		{
			// BuildKit does not expand %NAME% in WORKDIR.
			code: "WORKDIR %APP_HOME%",
			errors: [{ messageId: "expectedAbsolute" }],
		},
		{
			// An empty operand keeps the previous working directory.
			code: 'WORKDIR ""',
			errors: [{ messageId: "expectedAbsolute", data: { path: "" } }],
		},
		{
			// A drive letter is a relative path component on Linux.
			code: "FROM --platform=linux/amd64 alpine\nWORKDIR C:/app",
			errors: [{ messageId: "expectedAbsolute" }],
		},
		{
			// A $ without a variable name is kept literally.
			code: "WORKDIR $/cache",
			errors: [{ messageId: "expectedAbsolute" }],
		},
		{
			// $'...' is not expanded by Docker.
			code: "WORKDIR $'HOME'/cache",
			errors: [{ messageId: "expectedAbsolute" }],
		},
		{
			// An escaped $ is literal.
			code: "WORKDIR \\$HOME/app",
			errors: [{ messageId: "expectedAbsolute" }],
		},
		{
			// Single-quoted variable references are literal.
			code: "WORKDIR '$HOME'/app",
			errors: [
				{ messageId: "expectedAbsolute", data: { path: "$HOME/app" } },
			],
		},
		{
			code: 'WORKDIR "my app"/src',
			errors: [
				{ messageId: "expectedAbsolute", data: { path: "my app/src" } },
			],
		},
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
