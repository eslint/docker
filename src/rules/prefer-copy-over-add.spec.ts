/**
 * @fileoverview Tests for the prefer-copy-over-add rule.
 */

import { RuleTester } from "eslint";
import { DockerLanguage } from "../languages/docker-language.js";
import rule from "./prefer-copy-over-add.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerLanguage() },
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- plugin shape is validated by ESLint at runtime.
	} as any,
	language: "docker/dockerfile",
});

ruleTester.run("prefer-copy-over-add", rule as never, {
	valid: [
		"COPY src/ /app/",
		// URLs require ADD.
		"ADD https://example.com/file.tar.gz /tmp/",
		"ADD git@github.com:user/repo.git /src/",
		// Archives are auto-extracted by ADD.
		"ADD rootfs.tar.gz /",
		"ADD layer.tar /",
		"ADD app.tgz /opt/",
		// ADD-only flags.
		"ADD --checksum=sha256:abc123 files/ /app/",
		"ADD --keep-git-dir=true repo /src/",
		"ADD --unpack=false file.txt /app/",
		// Trailing slashes are ignored when resolving sources.
		"ADD rootfs.tar.gz/ /",
		// Variable sources cannot be checked.
		"ADD $ARTIFACT /app/",
		// Wildcards may match archives.
		"ADD *.tar.* /out/",
		"ADD layer?.bin /out/",
		// Quoted and escaped sources are not resolved.
		'ADD "rootfs.tar.gz" /',
		"ADD 'https://example.com/file' /tmp/",
		"ADD rootfs\\.tar.gz /",
		'ADD ["rootfs\\u002etar.gz", "/"]',
		"ADD",
	],
	invalid: [
		{
			code: "ADD src/ /app/",
			output: "COPY src/ /app/",
			errors: [
				{
					messageId: "useCopy",
					line: 1,
					column: 1,
					endColumn: 15,
				},
			],
		},
		{
			code: "ADD --chown=node:node src/ lib/ /app/",
			output: "COPY --chown=node:node src/ lib/ /app/",
			errors: [{ messageId: "useCopy" }],
		},
		{
			code: "add config.json /etc/app/config.json",
			output: "COPY config.json /etc/app/config.json",
			errors: [{ messageId: "useCopy" }],
		},
	],
});
