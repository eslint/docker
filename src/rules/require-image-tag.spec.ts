/**
 * @fileoverview Tests for the require-image-tag rule.
 */

import { RuleTester } from "eslint";
import { DockerLanguage } from "../languages/docker-language.js";
import rule from "./require-image-tag.js";

const ruleTester = new RuleTester({
	plugins: {
		docker: {
			languages: { dockerfile: new DockerLanguage() },
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- plugin shape is validated by ESLint at runtime.
	} as any,
	language: "docker/dockerfile",
});

ruleTester.run("require-image-tag", rule as never, {
	valid: [
		"FROM node:20",
		"FROM node:20-alpine AS base",
		"FROM alpine@sha256:c5b1261d6d3e43071626931fc004f70149baeba2c8ec672bd4f27761f8e1ad6b",
		"FROM scratch",
		"FROM $BASE_IMAGE",
		"FROM ${BASE_IMAGE:-node:20}",
		// References to earlier build stages need no tag.
		"FROM node:20 AS base\nFROM base",
		"FROM node:20 AS Base\nFROM base AS other",
		"FROM",
	],
	invalid: [
		{
			code: "FROM node",
			errors: [
				{
					messageId: "missingTag",
					data: { image: "node" },
					line: 1,
					column: 6,
					endColumn: 10,
				},
			],
		},
		{
			code: "FROM node:latest",
			errors: [
				{
					messageId: "latestTag",
					data: { image: "node" },
					line: 1,
					column: 6,
					endColumn: 17,
				},
			],
		},
		{
			code: "FROM registry.example.com/team/app",
			errors: [{ messageId: "missingTag" }],
		},
		{
			// Only earlier stages count as stage references.
			code: "FROM base\nFROM node:20 AS base",
			errors: [{ messageId: "missingTag", line: 1 }],
		},
		{
			code: "FROM node:20 AS build\nFROM ubuntu:latest",
			errors: [{ messageId: "latestTag", line: 2 }],
		},
		{
			// A tagged reference is an external image, even when an
			// earlier stage has the same name.
			code: "FROM node:20 AS node\nFROM node:latest",
			errors: [{ messageId: "latestTag", line: 2 }],
		},
	],
});
