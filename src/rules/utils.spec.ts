/**
 * @fileoverview Unit tests for the shared rule helpers.
 */

import { describe, expect, it } from "vitest";
import { splitShellCommands, spanOfTokens } from "./utils.js";
import { parseDocker } from "../parser/parse.js";
import type { RunInstructionNode, ShellFormNode } from "../types.js";

function shellForm(command: string): ShellFormNode {
	const { ast } = parseDocker(`RUN ${command}\n`);
	const run = ast.body[0] as RunInstructionNode;

	return run.command as ShellFormNode;
}

describe("splitShellCommands", () => {
	it("should return a single command when there are no separators", () => {
		const commands = splitShellCommands(
			shellForm("apt-get install -y git"),
		);

		expect(commands).toHaveLength(1);
		expect(commands[0]?.words).toEqual(["apt-get", "install", "-y", "git"]);
	});

	it("should split on && and || operator tokens", () => {
		const commands = splitShellCommands(
			shellForm("apt-get update && apt-get install -y git || true"),
		);

		expect(commands.map(command => command.words)).toEqual([
			["apt-get", "update"],
			["apt-get", "install", "-y", "git"],
			["true"],
		]);
	});

	it("should split on pipes and standalone semicolons", () => {
		const commands = splitShellCommands(
			shellForm("cat foo | grep bar ; ls"),
		);

		expect(commands.map(command => command.words)).toEqual([
			["cat", "foo"],
			["grep", "bar"],
			["ls"],
		]);
	});

	it("should split on trailing semicolons attached to a token", () => {
		const commands = splitShellCommands(shellForm("cd /app; make"));

		expect(commands.map(command => command.words)).toEqual([
			["cd", "/app"],
			["make"],
		]);
	});

	it("should strip a leading parenthesis from the first word", () => {
		const commands = splitShellCommands(shellForm("(cd /app && make)"));

		expect(commands[0]?.words[0]).toBe("cd");
	});

	it("should not split quoted operators", () => {
		const commands = splitShellCommands(shellForm('echo "a && b"'));

		// "a && b" is quoted, so the && token never stands alone.
		expect(commands).toHaveLength(1);
	});

	it("should keep token nodes alongside the cleaned words", () => {
		const commands = splitShellCommands(shellForm("cd /app; make"));
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
		const form = shellForm("echo one two");
		const span = spanOfTokens(form.arguments);

		expect(span).toEqual({ start: 4, end: 16 });
	});
});
