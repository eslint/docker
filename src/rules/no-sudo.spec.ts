/**
 * @fileoverview Tests for the no-sudo rule.
 */

import { RuleTester } from "eslint";
import { DockerLanguage } from "../languages/docker-language.js";
import rule from "./no-sudo.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerLanguage() },
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- plugin shape is validated by ESLint at runtime.
	} as any,
	language: "docker/dockerfile",
});

ruleTester.run("no-sudo", rule as never, {
	valid: [
		"RUN apt-get update",
		"RUN echo sudo",
		"RUN apt-get install -y sudo",
		'RUN ["sudo", "ls"]',
		"USER root\nRUN apt-get update",
	],
	invalid: [
		{
			code: "RUN sudo apt-get update",
			errors: [
				{
					messageId: "noSudo",
					line: 1,
					column: 5,
					endColumn: 24,
				},
			],
		},
		{
			code: "RUN make && sudo make install",
			errors: [{ messageId: "noSudo", column: 13 }],
		},
		{
			code: "RUN sudo ls; sudo whoami",
			errors: [{ messageId: "noSudo" }, { messageId: "noSudo" }],
		},
	],
});
