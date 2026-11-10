/**
 * @fileoverview Tests for the prefer-exec-form rule.
 */

import { RuleTester } from "eslint";
import { DockerLanguage } from "../languages/docker-language.js";
import rule from "./prefer-exec-form.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerLanguage() },
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- plugin shape is validated by ESLint at runtime.
	} as any,
	language: "docker/dockerfile",
});

ruleTester.run("prefer-exec-form", rule as never, {
	valid: [
		'CMD ["node", "app.js"]',
		'ENTRYPOINT ["/docker-entrypoint.sh"]',
		// RUN legitimately uses the shell form.
		"RUN apt-get update",
		"CMD",
	],
	invalid: [
		{
			code: "CMD npm start",
			output: 'CMD ["npm", "start"]',
			errors: [
				{
					messageId: "useExecForm",
					data: { keyword: "CMD" },
					line: 1,
					column: 5,
					endColumn: 14,
				},
			],
		},
		{
			code: "ENTRYPOINT /docker-entrypoint.sh",
			output: 'ENTRYPOINT ["/docker-entrypoint.sh"]',
			errors: [
				{
					messageId: "useExecForm",
					data: { keyword: "ENTRYPOINT" },
				},
			],
		},
		{
			// Shell features prevent a safe autofix.
			code: "CMD node app.js > /var/log/app.log",
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		{
			code: "CMD echo $HOME",
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		{
			code: 'CMD echo "hello world"',
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
	],
});
