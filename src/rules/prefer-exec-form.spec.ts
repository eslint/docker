/**
 * @fileoverview Tests for the prefer-exec-form rule.
 */

import { RuleTester } from "eslint";
import { DockerFileLanguage } from "../languages/docker-language.js";
import rule from "./prefer-exec-form.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerFileLanguage() },
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
		// cmd.exe expands %VAR% in the shell form only.
		{
			code: "CMD ping %COMPUTERNAME%",
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		// A leading assignment is an environment variable, not a command.
		{
			code: "CMD NODE_ENV=production node app.js",
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		// Shell builtins cannot be executed from the exec form.
		{
			code: "ENTRYPOINT exec /app/server",
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		{
			code: "CMD . /env.sh",
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		// After SHELL, the command may need that shell.
		{
			code: 'SHELL ["powershell", "-command"]\nCMD Write-Host hello',
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		{
			code: 'FROM base AS a\nSHELL ["pwsh", "-c"]\nFROM a\nCMD Write-Host hello',
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		// SHELL after the instruction does not apply to it.
		{
			code: 'CMD npm start\nSHELL ["/bin/bash", "-c"]',
			output: 'CMD ["npm", "start"]\nSHELL ["/bin/bash", "-c"]',
			errors: [{ messageId: "useExecForm" }],
		},
		// An exec-form ENTRYPOINT would start receiving CMD as arguments.
		{
			code: 'ENTRYPOINT /bin/sleep 60\nCMD ["--invalid"]',
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		{
			code: 'CMD ["--invalid"]\nENTRYPOINT /bin/sleep 60',
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		// CMD in another stage does not apply.
		{
			code: 'FROM a\nCMD ["--invalid"]\nFROM b\nENTRYPOINT /bin/sleep 60',
			output: 'FROM a\nCMD ["--invalid"]\nFROM b\nENTRYPOINT ["/bin/sleep", "60"]',
			errors: [{ messageId: "useExecForm" }],
		},
		// A later stage built on this one inherits the ENTRYPOINT.
		{
			code: 'FROM alpine AS base\nENTRYPOINT /bin/sleep 60\nFROM base\nCMD ["--invalid"]',
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		// A child stage that replaces the ENTRYPOINT does not block the fix.
		{
			code: 'FROM alpine AS base\nENTRYPOINT /bin/sleep 60\nFROM base\nENTRYPOINT ["/bin/true"]\nCMD ["x"]',
			output: 'FROM alpine AS base\nENTRYPOINT ["/bin/sleep", "60"]\nFROM base\nENTRYPOINT ["/bin/true"]\nCMD ["x"]',
			errors: [{ messageId: "useExecForm" }],
		},
		// A bracket that does not start a JSON array is shell form.
		{
			code: "CMD [ -f /ready ]",
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		// The external echo may behave differently from the builtin.
		{
			code: "CMD echo -e ready",
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		{
			code: "CMD /usr/bin/echo ready",
			output: 'CMD ["/usr/bin/echo", "ready"]',
			errors: [{ messageId: "useExecForm" }],
		},
		// An escaped blank keeps two words together.
		{
			code: "CMD /bin/cat report\\ final.txt",
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		// Windows images use cmd.exe as the default shell.
		{
			code: "FROM mcr.microsoft.com/windows/servercore:ltsc2022\nCMD dir",
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		{
			code: "FROM --platform=windows/amd64 example/app\nCMD dir",
			output: null,
			errors: [{ messageId: "useExecForm" }],
		},
		// ONBUILD triggers are reported without a fix.
		{
			code: "ONBUILD CMD /app/start",
			output: null,
			errors: [{ messageId: "useExecForm", column: 13 }],
		},
		// Arguments that are not assignments still convert.
		{
			code: "CMD node app.js --port=8080",
			output: 'CMD ["node", "app.js", "--port=8080"]',
			errors: [{ messageId: "useExecForm" }],
		},
	],
});
