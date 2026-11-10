/**
 * @fileoverview Tests for the no-cd-in-run rule.
 */

import { RuleTester } from "eslint";
import { DockerLanguage } from "../languages/docker-language.js";
import rule from "./no-cd-in-run.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerLanguage() },
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- plugin shape is validated by ESLint at runtime.
	} as any,
	language: "docker/dockerfile",
});

ruleTester.run("no-cd-in-run", rule as never, {
	valid: [
		"WORKDIR /app\nRUN make",
		"RUN echo cd",
		"RUN mycd /app",
		// Exec form is not shell code.
		'RUN ["cd", "/app"]',
		"RUN",
	],
	invalid: [
		{
			// A lone `cd` converts directly to WORKDIR.
			code: "RUN cd /app",
			output: "WORKDIR /app",
			errors: [
				{
					messageId: "useWorkdir",
					line: 1,
					column: 5,
					endColumn: 12,
				},
			],
		},
		{
			// Compound commands are reported without a fix.
			code: "RUN cd /app && make",
			output: null,
			errors: [
				{
					messageId: "useWorkdir",
					column: 5,
					endColumn: 12,
				},
			],
		},
		{
			code: "RUN make && cd /out",
			output: null,
			errors: [{ messageId: "useWorkdir", column: 13 }],
		},
		{
			code: "RUN cd /app; make",
			output: null,
			errors: [{ messageId: "useWorkdir" }],
		},
		{
			// Multi-line RUN instructions are not autofixed.
			code: "RUN cd \\\n    /app",
			output: null,
			errors: [{ messageId: "useWorkdir" }],
		},
	],
});
