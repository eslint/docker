/**
 * @fileoverview Tests for the no-apt-get-upgrade rule.
 */

import { RuleTester } from "eslint";
import { DockerLanguage } from "../languages/docker-language.js";
import rule from "./no-apt-get-upgrade.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerLanguage() },
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- plugin shape is validated by ESLint at runtime.
	} as any,
	language: "docker/dockerfile",
});

ruleTester.run("no-apt-get-upgrade", rule as never, {
	valid: [
		"RUN apt-get update",
		"RUN apt-get update && apt-get install -y git",
		"RUN apt install -y curl",
		"RUN echo apt-get upgrade",
		// The word upgrade elsewhere is fine.
		"RUN pip install --upgrade pip",
		'RUN ["apt-get", "upgrade"]',
		// The configuration file name is not the subcommand.
		"RUN apt-get -c upgrade update",
		"RUN apt-get --config-file upgrade update",
		// An escaped semicolon does not start a new command.
		"RUN echo marker\\; sudo apt-get upgrade",
	],
	invalid: [
		{
			code: "RUN apt-get -o Acquire::Retries=3 upgrade -y",
			errors: [
				{
					messageId: "noUpgrade",
					data: { command: "apt-get", subcommand: "upgrade" },
				},
			],
		},
		{
			code: "RUN apt -t bookworm-backports full-upgrade",
			errors: [
				{
					messageId: "noUpgrade",
					data: { command: "apt", subcommand: "full-upgrade" },
				},
			],
		},
		{
			code: "RUN apt-get upgrade -y",
			errors: [
				{
					messageId: "noUpgrade",
					data: { command: "apt-get", subcommand: "upgrade" },
					line: 1,
					column: 5,
					endColumn: 23,
				},
			],
		},
		{
			code: "RUN apt-get update && apt-get upgrade -y",
			errors: [{ messageId: "noUpgrade", column: 23 }],
		},
		{
			code: "RUN apt-get -y dist-upgrade",
			errors: [
				{
					messageId: "noUpgrade",
					data: { command: "apt-get", subcommand: "dist-upgrade" },
				},
			],
		},
		{
			code: "RUN apt upgrade",
			errors: [
				{
					messageId: "noUpgrade",
					data: { command: "apt", subcommand: "upgrade" },
				},
			],
		},
		{
			code: "RUN apt full-upgrade -y",
			errors: [{ messageId: "noUpgrade" }],
		},
	],
});
