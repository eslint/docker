/**
 * @fileoverview Tests for the prefer-copy-over-add rule.
 */

import { RuleTester } from "eslint";
import { DockerFileLanguage } from "../languages/docker-language.js";
import rule from "./prefer-copy-over-add.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerFileLanguage() },
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
		"ADD deploy@code.example.org:team/repo.git /src/",
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
		"ADD rootfs.tar.gz/. /",
		"ADD rootfs.tar.gz//./ /",
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
			// A long run of slashes inside a source is checked in linear
			// time.
			code: `ADD src${"/".repeat(64)}file /app/`,
			output: null,
			errors: [
				{
					messageId: "useCopy",
					suggestions: [
						{
							messageId: "replaceWithCopy",
							output: `COPY src${"/".repeat(64)}file /app/`,
						},
					],
				},
			],
		},
		{
			// A keyword split by a line continuation gets no suggestion.
			code: "AD\\\nD src/ /app/",
			output: null,
			errors: [{ messageId: "useCopy", suggestions: [] }],
		},
		{
			code: "ADD src/ /app/",
			output: null,
			errors: [
				{
					messageId: "useCopy",
					line: 1,
					column: 1,
					endColumn: 15,
					suggestions: [
						{
							messageId: "replaceWithCopy",
							output: "COPY src/ /app/",
						},
					],
				},
			],
		},
		{
			code: "ADD --chown=node:node src/ lib/ /app/",
			output: null,
			errors: [
				{
					messageId: "useCopy",
					suggestions: [
						{
							messageId: "replaceWithCopy",
							output: "COPY --chown=node:node src/ lib/ /app/",
						},
					],
				},
			],
		},
		{
			code: "add config.json /etc/app/config.json",
			output: null,
			errors: [
				{
					messageId: "useCopy",
					suggestions: [
						{
							messageId: "replaceWithCopy",
							output: "COPY config.json /etc/app/config.json",
						},
					],
				},
			],
		},
	],
});
