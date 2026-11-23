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

	it("should omit a standalone group opener", () => {
		const commands = split("( cd /app && make )");

		expect(commands[0]?.words).toEqual(["cd", "/app"]);
		expect(commands[0]?.tokens[0].value).toBe("cd");
	});

	it("should keep an escaped opening parenthesis", () => {
		const commands = split("\\(cd /app");

		expect(commands[0]?.words[0]).toBe("(cd");
	});

	it("should stop at a comment right after a semicolon", () => {
		const commands = split("echo ok;# note && make");

		expect(commands.map(command => command.words)).toEqual([
			["echo", "ok"],
		]);
	});

	it("should not start a comment after an escaped blank", () => {
		const commands = split("echo word\\ #tag && make");

		expect(commands.map(command => command.words[0])).toEqual([
			"echo",
			"make",
		]);
	});

	it("should start a comment after an unescaped blank that follows an escaped one", () => {
		const commands = split("echo word\\  # note && make");

		expect(commands.map(command => command.words[0])).toEqual(["echo"]);
	});

	it("should start a comment after an escaped backslash and a blank", () => {
		const commands = split("echo word\\\\ # note && make");

		expect(commands.map(command => command.words[0])).toEqual(["echo"]);
	});

	it("should ignore comment lines inside continued tokens", () => {
		const commands = split('echo o\\\n# "\nk && make');

		expect(commands.map(command => command.words[0])).toEqual([
			"echo",
			"make",
		]);
	});

	it("should classify operators split by a line continuation", () => {
		const commands = split("echo ok &\\\n& make");

		expect(commands.map(command => command.words[0])).toEqual([
			"echo",
			"make",
		]);
	});

	it("should not split quoted operators", () => {
		const commands = split('echo "a && b"');

		// "a && b" is quoted, so the && token never stands alone.
		expect(commands).toHaveLength(1);
	});

	it("should ignore words after an unquoted shell comment", () => {
		const commands = split("echo ok # example && sudo id");

		expect(commands.map(command => command.words)).toEqual([
			["echo", "ok"],
		]);
	});

	it("should not treat a quoted or mid-word # as a comment", () => {
		const commands = split("echo '# a' b#c && ls");

		expect(commands.map(command => command.words)).toEqual([
			["echo", "'#", "a'", "b#c"],
			["ls"],
		]);
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
		const [command] = split("echo one two");
		const span = spanOfTokens((command as ShellCommand).tokens);

		expect(span).toEqual({ start: 4, end: 16 });
	});
});
