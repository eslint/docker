/**
 * @fileoverview Unit tests for the shared rule helpers.
 */

import { describe, expect, it } from "vitest";
import { splitShellCommands, spanOfTokens } from "./utils.js";
import { parseDocker } from "../parser/parse.js";
import type { ShellCommand } from "./utils.js";
import type { RunInstructionNode, ShellFormNode } from "../types.js";

function parseRun(command: string): {
	text: string;
	form: ShellFormNode;
} {
	const text = `RUN ${command}\n`;
	const { ast } = parseDocker(text);
	const run = ast.body[0] as RunInstructionNode;

	return { text, form: run.command as ShellFormNode };
}

function split(command: string): ShellCommand[] {
	const { text, form } = parseRun(command);

	return splitShellCommands(form, text);
}

describe("splitShellCommands", () => {
	it("should return a single command when there are no separators", () => {
		const commands = split("apt-get install -y git");

		expect(commands).toHaveLength(1);
		expect(commands[0]?.words).toEqual(["apt-get", "install", "-y", "git"]);
	});

	it("should split on && and || operator tokens", () => {
		const commands = split(
			"apt-get update && apt-get install -y git || true",
		);

		expect(commands.map(command => command.words)).toEqual([
			["apt-get", "update"],
			["apt-get", "install", "-y", "git"],
			["true"],
		]);
	});

	it("should split on pipes and standalone semicolons", () => {
		const commands = split("cat foo | grep bar ; ls");

		expect(commands.map(command => command.words)).toEqual([
			["cat", "foo"],
			["grep", "bar"],
			["ls"],
		]);
	});

	it("should split on trailing semicolons attached to a token", () => {
		const commands = split("cd /app; make");

		expect(commands.map(command => command.words)).toEqual([
			["cd", "/app"],
			["make"],
		]);
	});

	it("should not split on escaped trailing semicolons", () => {
		const commands = split("echo marker\\; sudo apt-get upgrade");

		expect(commands.map(command => command.words)).toEqual([
			["echo", "marker;", "sudo", "apt-get", "upgrade"],
		]);
	});

	it("should not split on quoted trailing semicolons", () => {
		const commands = split("echo 'marker;' sudo");

		expect(commands.map(command => command.words)).toEqual([
			["echo", "'marker;'", "sudo"],
		]);
	});

	it("should split after an escaped backslash before a semicolon", () => {
		const commands = split("echo a\\\\; make");

		expect(commands.map(command => command.words)).toEqual([
			["echo", "a\\"],
			["make"],
		]);
	});

	it("should strip a leading parenthesis from the first word", () => {
		const commands = split("(cd /app && make)");

		expect(commands[0]?.words[0]).toBe("cd");
	});

	it("should not split quoted operators", () => {
		const commands = split('echo "a && b"');

		// "a && b" is quoted, so the && token never stands alone.
		expect(commands).toHaveLength(1);
	});

	it("should keep token nodes alongside the cleaned words", () => {
		const commands = split("cd /app; make");
		const first = commands[0];

		expect(first?.tokens.map(token => token.value)).toEqual([
			"cd",
			"/app;",
		]);
		expect(first?.words).toEqual(["cd", "/app"]);
	});
});

describe("spanOfTokens", () => {
	it("should span from the first to the last token", () => {
		const { form } = parseRun("echo one two");
		const span = spanOfTokens(form.arguments);

		expect(span).toEqual({ start: 4, end: 16 });
	});
});
