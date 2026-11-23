/**
 * @fileoverview Unit tests for the Dockerfile parser wrapper.
 * @author Claude Fable 5
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { parseDocker } from "./parse.js";
import type {
	AddInstructionNode,
	ArgInstructionNode,
	CmdInstructionNode,
	CopyInstructionNode,
	EntrypointInstructionNode,
	EnvInstructionNode,
	ExecFormNode,
	ExposeInstructionNode,
	FromInstructionNode,
	GenericInstructionNode,
	HealthcheckInstructionNode,
	LabelInstructionNode,
	MaintainerInstructionNode,
	OnbuildInstructionNode,
	RunInstructionNode,
	ShellFormNode,
	ShellInstructionNode,
	StopsignalInstructionNode,
	UserInstructionNode,
	VolumeInstructionNode,
	WorkdirInstructionNode,
} from "../types.js";

describe("parseDocker", () => {
	it("should produce an empty Dockerfile node for empty input", () => {
		const { ast, comments } = parseDocker("");

		expect(ast).toEqual({
			type: "Dockerfile",
			body: [],
			comments: [],
			directives: [],
			start: 0,
			end: 0,
		});
		expect(comments).toEqual([]);
	});

	it("should span the whole text with the root node", () => {
		const text = "FROM node:20\n";
		const { ast } = parseDocker(text);

		expect(ast.start).toBe(0);
		expect(ast.end).toBe(text.length);
	});

	it.each([
		["LF", "\n"],
		["CRLF", "\r\n"],
		["CR", "\r"],
	])("should compute offsets with %s line endings", (_, eol) => {
		const text = `FROM alpine${eol}RUN echo hi${eol}`;
		const { ast } = parseDocker(text);

		expect(ast.body.map(node => node.start)).toEqual([
			0,
			text.indexOf("RUN"),
		]);
		expect(ast.body[1]?.end).toBe(text.indexOf("hi") + 2);
	});

	describe("comments and directives", () => {
		it("should collect comments with offsets and stripped text", () => {
			const text = "# hello world\nFROM node:20\n";
			const { ast, comments } = parseDocker(text);

			expect(comments).toHaveLength(1);
			expect(comments[0]).toMatchObject({
				type: "Comment",
				text: "hello world",
				start: 0,
				end: 13,
			});
			expect(ast.comments).toBe(comments);
		});

		it("should treat leading pragmas as parser directives", () => {
			const text = "# syntax=docker/dockerfile:1\nFROM node:20\n";
			const { ast } = parseDocker(text);

			expect(ast.directives).toHaveLength(1);
			expect(ast.directives[0]).toMatchObject({
				type: "ParserDirective",
				name: "syntax",
				value: "docker/dockerfile:1",
				start: 0,
				end: 28,
			});
		});
	});

	describe("FROM", () => {
		it("should parse image name, tag, and stage alias", () => {
			const text = "FROM node:20-alpine AS base\n";
			const { ast } = parseDocker(text);
			const from = ast.body[0] as FromInstructionNode;

			expect(from.type).toBe("FromInstruction");
			expect(from.keyword).toBe("FROM");
			expect(from.start).toBe(0);
			expect(from.end).toBe(27);
			expect(from.image).toMatchObject({
				type: "ImageReference",
				name: "node",
				tag: "20-alpine",
				digest: null,
				start: 5,
				end: 19,
			});
			expect(from.alias).toMatchObject({
				type: "StageName",
				name: "base",
				start: 23,
				end: 27,
			});
		});

		it("should parse digests and platform flags", () => {
			const text =
				"FROM --platform=linux/amd64 alpine@sha256:abc123def\n";
			const { ast } = parseDocker(text);
			const from = ast.body[0] as FromInstructionNode;

			expect(from.image).toMatchObject({
				name: "alpine",
				tag: null,
				digest: "sha256:abc123def",
			});
			expect(from.flags).toHaveLength(1);
			expect(from.flags[0]).toMatchObject({
				type: "Flag",
				name: "platform",
				value: "linux/amd64",
			});
			expect(from.alias).toBeNull();
		});

		it("should keep the registry in the image name", () => {
			for (const [text, name, tag] of [
				[
					"FROM registry.example.com/base\n",
					"registry.example.com/base",
					null,
				],
				[
					"FROM localhost:5000/team/app:1.2\n",
					"localhost:5000/team/app",
					"1.2",
				],
				[
					"FROM docker.io/library/node:20\n",
					"docker.io/library/node",
					"20",
				],
				["FROM ghcr.io/org/app\n", "ghcr.io/org/app", null],
				["FROM org/app:1\n", "org/app", "1"],
				[
					"FROM localhost:5000/team/app:1.2@sha256:abc\n",
					"localhost:5000/team/app",
					"1.2",
				],
				[
					"FROM localhost:5000/team/app@sha256:abc\n",
					"localhost:5000/team/app",
					null,
				],
			] as const) {
				const from = parseDocker(text).ast
					.body[0] as FromInstructionNode;

				expect(from.image).toMatchObject({ name, tag });
			}
		});

		it("should remove line continuations from image parts and aliases", () => {
			const text = "FROM ghcr.io/org/ap\\\npp:lat\\\nest AS bu\\\nild\n";
			const from = parseDocker(text).ast.body[0] as FromInstructionNode;

			expect(from.image).toMatchObject({
				name: "ghcr.io/org/appp",
				tag: "latest",
			});
			expect(from.alias?.name).toBe("build");
		});

		it("should remove continuations using the escape directive", () => {
			const text = "# escape=`\nFROM node:2`\n0 AS a`\nb\n";
			const from = parseDocker(text).ast.body[0] as FromInstructionNode;

			expect(from.image?.tag).toBe("20");
			expect(from.alias?.name).toBe("ab");
		});

		it("should handle FROM without an image", () => {
			const { ast } = parseDocker("FROM\n");
			const from = ast.body[0] as FromInstructionNode;

			expect(from.image).toBeNull();
		});
	});

	describe("RUN", () => {
		it("should parse shell form commands into tokens", () => {
			const text = "RUN apt-get update && apt-get install -y git\n";
			const { ast } = parseDocker(text);
			const run = ast.body[0] as RunInstructionNode;
			const command = run.command as ShellFormNode;

			expect(run.type).toBe("RunInstruction");
			expect(command.type).toBe("ShellForm");
			expect(command.arguments.map(argument => argument.value)).toEqual([
				"apt-get",
				"update",
				"&&",
				"apt-get",
				"install",
				"-y",
				"git",
			]);
			expect(command.start).toBe(4);
			expect(command.end).toBe(44);
		});

		it("should resolve line continuations in shell form commands", () => {
			const text =
				"RUN apt-get update && \\\n    apt-get install -y git\n";
			const { ast } = parseDocker(text);
			const run = ast.body[0] as RunInstructionNode;
			const command = run.command as ShellFormNode;

			expect(command.arguments.map(argument => argument.value)).toEqual([
				"apt-get",
				"update",
				"&&",
				"apt-get",
				"install",
				"-y",
				"git",
			]);

			// The instruction spans both physical lines.
			expect(run.start).toBe(0);
			expect(run.end).toBe(text.length - 1);
		});

		it("should parse exec form commands into elements", () => {
			const text = 'RUN ["/bin/bash", "-c", "echo hi"]\n';
			const { ast } = parseDocker(text);
			const run = ast.body[0] as RunInstructionNode;
			const command = run.command as ExecFormNode;

			expect(command.type).toBe("ExecForm");
			expect(command.elements.map(element => element.value)).toEqual([
				"/bin/bash",
				"-c",
				"echo hi",
			]);

			// The form spans the brackets; elements include their quotes.
			expect(command.start).toBe(4);
			expect(command.end).toBe(34);
			expect(command.elements[0]).toMatchObject({ start: 5, end: 16 });
		});

		it("should keep JSON escapes in exec form element values", () => {
			const text = 'CMD ["a\\u0062"]\n';
			const cmd = parseDocker(text).ast.body[0] as CmdInstructionNode;
			const command = cmd.command as ExecFormNode;

			expect(command.elements[0]).toMatchObject({
				value: "a\\u0062",
				start: 5,
				end: 14,
			});
		});

		it("should parse bracket-leading commands that are not JSON as shell form", () => {
			for (const text of [
				"RUN [ -f /app/config ] && echo ready\n",
				'RUN ["echo", "unterminated"\n',
				'RUN ["echo", 1]\n',
				'RUN ["echo"] && true\n',
			]) {
				const run = parseDocker(text).ast.body[0] as RunInstructionNode;

				expect(run.command?.type).toBe("ShellForm");
			}

			const run = parseDocker("RUN [ -f /app/config ] && echo ready\n")
				.ast.body[0] as RunInstructionNode;

			expect(
				(run.command as ShellFormNode).arguments.map(
					argument => argument.value,
				),
			).toEqual(["[", "-f", "/app/config", "]", "&&", "echo", "ready"]);
		});

		it("should have a null command for empty RUN", () => {
			const { ast } = parseDocker("RUN\n");
			const run = ast.body[0] as RunInstructionNode;

			expect(run.command).toBeNull();
		});
	});

	describe("CMD, ENTRYPOINT, and SHELL", () => {
		it("should parse CMD and ENTRYPOINT like RUN", () => {
			const text = 'CMD npm start\nENTRYPOINT ["node", "app.js"]\n';
			const { ast } = parseDocker(text);
			const cmd = ast.body[0] as CmdInstructionNode;
			const entrypoint = ast.body[1] as EntrypointInstructionNode;

			expect(cmd.type).toBe("CmdInstruction");
			expect(cmd.command?.type).toBe("ShellForm");
			expect(entrypoint.type).toBe("EntrypointInstruction");
			expect(entrypoint.command?.type).toBe("ExecForm");
		});

		it("should only accept exec form for SHELL", () => {
			const text = 'SHELL ["powershell", "-Command"]\nSHELL bogus\n';
			const { ast } = parseDocker(text);
			const good = ast.body[0] as ShellInstructionNode;
			const bad = ast.body[1] as ShellInstructionNode;

			expect(good.command?.type).toBe("ExecForm");
			expect(
				good.command?.elements.map(element => element.value),
			).toEqual(["powershell", "-Command"]);
			expect(bad.command).toBeNull();
		});
	});

	describe("COPY and ADD", () => {
		it("should split sources and destination", () => {
			const text = "COPY --chown=node:node src/ lib/ /app/\n";
			const { ast } = parseDocker(text);
			const copy = ast.body[0] as CopyInstructionNode;

			expect(copy.type).toBe("CopyInstruction");
			expect(copy.sources.map(source => source.value)).toEqual([
				"src/",
				"lib/",
			]);
			expect(copy.destination?.value).toBe("/app/");
			expect(copy.flags[0]).toMatchObject({
				name: "chown",
				value: "node:node",
			});
		});

		it("should support the JSON form", () => {
			const text = 'ADD ["src dir", "/app/"]\n';
			const { ast } = parseDocker(text);
			const add = ast.body[0] as AddInstructionNode;

			expect(add.type).toBe("AddInstruction");
			expect(add.sources.map(source => source.value)).toEqual([
				"src dir",
			]);
			expect(add.destination?.value).toBe("/app/");
		});

		it("should treat bracket-leading paths that are not JSON as plain form", () => {
			const copy = parseDocker("COPY [ab].txt /dest/\n").ast
				.body[0] as CopyInstructionNode;

			expect(copy.sources.map(source => source.value)).toEqual([
				"[ab].txt",
			]);
			expect(copy.destination?.value).toBe("/dest/");
		});

		it("should take sources and destination from the heredoc header", () => {
			const text = "COPY <<EOF /app/message.txt\nhello\nEOF\n";
			const copy = parseDocker(text).ast.body[0] as CopyInstructionNode;

			expect(copy.sources.map(source => source.value)).toEqual(["<<EOF"]);
			expect(copy.destination?.value).toBe("/app/message.txt");
			expect(copy.end).toBe(text.length - 1);
		});

		it("should skip comment lines inside a continued heredoc header", () => {
			const text =
				"COPY <<EOF \\\n# note\n\n/app/message.txt\nhello\nEOF\n";
			const copy = parseDocker(text).ast.body[0] as CopyInstructionNode;

			expect(copy.sources.map(source => source.value)).toEqual(["<<EOF"]);
			expect(copy.destination?.value).toBe("/app/message.txt");
		});

		it("should handle a missing destination", () => {
			const { ast } = parseDocker("COPY src/\n");
			const copy = ast.body[0] as CopyInstructionNode;

			expect(copy.sources).toEqual([]);
			expect(copy.destination?.value).toBe("src/");
		});
	});

	describe("ENV, LABEL, and ARG", () => {
		it("should parse = pairs with quoted values", () => {
			const text = 'ENV FOO=bar BAZ="qux quux"\n';
			const { ast } = parseDocker(text);
			const env = ast.body[0] as EnvInstructionNode;

			expect(env.type).toBe("EnvInstruction");
			expect(env.pairs).toHaveLength(2);
			expect(env.pairs[0]).toMatchObject({ type: "KeyValuePair" });
			expect(env.pairs[0]?.key).toMatchObject({
				value: "FOO",
				start: 4,
				end: 7,
			});
			expect(env.pairs[0]?.value).toMatchObject({ value: "bar" });

			// The value string is unquoted, but the offsets include quotes.
			expect(env.pairs[1]?.value).toMatchObject({
				value: "qux quux",
				start: 16,
				end: 26,
			});
		});

		it("should parse the legacy space-separated ENV form", () => {
			const { ast } = parseDocker("ENV OLD style value\n");
			const env = ast.body[0] as EnvInstructionNode;

			expect(env.pairs).toHaveLength(1);
			expect(env.pairs[0]?.key.value).toBe("OLD");
			expect(env.pairs[0]?.value?.value).toBe("style value");
		});

		it("should parse valueless ARG declarations", () => {
			const { ast } = parseDocker("ARG VERSION\nARG DEBUG=false\n");
			const bare = ast.body[0] as ArgInstructionNode;
			const withDefault = ast.body[1] as ArgInstructionNode;

			expect(bare.type).toBe("ArgInstruction");
			expect(bare.pairs[0]?.key.value).toBe("VERSION");
			expect(bare.pairs[0]?.value).toBeNull();
			expect(withDefault.pairs[0]?.value?.value).toBe("false");
		});

		it("should parse LABEL pairs", () => {
			const { ast } = parseDocker('LABEL maintainer="me@example.com"\n');
			const label = ast.body[0] as LabelInstructionNode;

			expect(label.type).toBe("LabelInstruction");
			expect(label.pairs[0]?.key.value).toBe("maintainer");
			expect(label.pairs[0]?.value?.value).toBe("me@example.com");
		});
	});

	describe("single-argument instructions", () => {
		it("should parse WORKDIR, USER, and STOPSIGNAL", () => {
			const text = "WORKDIR /app\nUSER node\nSTOPSIGNAL SIGTERM\n";
			const { ast } = parseDocker(text);
			const workdir = ast.body[0] as WorkdirInstructionNode;
			const user = ast.body[1] as UserInstructionNode;
			const stopsignal = ast.body[2] as StopsignalInstructionNode;

			expect(workdir.type).toBe("WorkdirInstruction");
			expect(workdir.path?.value).toBe("/app");
			expect(user.type).toBe("UserInstruction");
			expect(user.user?.value).toBe("node");
			expect(stopsignal.type).toBe("StopsignalInstruction");
			expect(stopsignal.signal?.value).toBe("SIGTERM");
		});

		it("should keep whitespace in WORKDIR paths", () => {
			const text = "WORKDIR /app/my project\n";
			const { ast } = parseDocker(text);
			const path = (ast.body[0] as WorkdirInstructionNode).path;

			expect(path?.value).toBe("/app/my project");
			expect(text.slice(path?.start, path?.end)).toBe("/app/my project");
		});

		it("should join WORKDIR paths across line continuations", () => {
			const { ast } = parseDocker("WORKDIR /app/my\\\nproject\n");
			const path = (ast.body[0] as WorkdirInstructionNode).path;

			expect(path?.value).toBe("/app/myproject");
		});

		it("should drop comment lines inside WORKDIR continuations", () => {
			const text = "WORKDIR /app/\\\n# note\nsub\n";
			const path = (
				parseDocker(text).ast.body[0] as WorkdirInstructionNode
			).path;

			expect(path?.value).toBe("/app/sub");
			expect(path?.end).toBe(text.length - 1);
		});

		it("should handle missing arguments", () => {
			const { ast } = parseDocker("WORKDIR\nUSER\n");

			expect((ast.body[0] as WorkdirInstructionNode).path).toBeNull();
			expect((ast.body[1] as UserInstructionNode).user).toBeNull();
		});
	});

	describe("EXPOSE and VOLUME", () => {
		it("should parse EXPOSE ports", () => {
			const { ast } = parseDocker("EXPOSE 8080 9090/udp\n");
			const expose = ast.body[0] as ExposeInstructionNode;

			expect(expose.type).toBe("ExposeInstruction");
			expect(expose.ports.map(port => port.value)).toEqual([
				"8080",
				"9090/udp",
			]);
		});

		it("should parse VOLUME in both forms", () => {
			const text = 'VOLUME /data /logs\nVOLUME ["/var/db"]\n';
			const { ast } = parseDocker(text);
			const plain = ast.body[0] as VolumeInstructionNode;
			const json = ast.body[1] as VolumeInstructionNode;

			expect(plain.paths.map(path => path.value)).toEqual([
				"/data",
				"/logs",
			]);
			expect(json.paths.map(path => path.value)).toEqual(["/var/db"]);
		});
	});

	describe("HEALTHCHECK", () => {
		it("should parse the subcommand, flags, and command tokens", () => {
			const text =
				"HEALTHCHECK --interval=5s CMD curl -f http://localhost/\n";
			const { ast } = parseDocker(text);
			const healthcheck = ast.body[0] as HealthcheckInstructionNode;

			expect(healthcheck.type).toBe("HealthcheckInstruction");
			expect(healthcheck.subcommand?.value).toBe("CMD");
			expect(healthcheck.flags[0]).toMatchObject({
				name: "interval",
				value: "5s",
			});
			expect(
				healthcheck.arguments.map(argument => argument.value),
			).toEqual(["curl", "-f", "http://localhost/"]);
		});

		it("should parse HEALTHCHECK NONE", () => {
			const { ast } = parseDocker("HEALTHCHECK NONE\n");
			const healthcheck = ast.body[0] as HealthcheckInstructionNode;

			expect(healthcheck.subcommand?.value).toBe("NONE");
			expect(healthcheck.arguments).toEqual([]);
		});
	});

	describe("ONBUILD", () => {
		it("should parse the trigger as a nested instruction", () => {
			const text = "ONBUILD COPY . /app\n";
			const { ast } = parseDocker(text);
			const onbuild = ast.body[0] as OnbuildInstructionNode;
			const trigger = onbuild.trigger as CopyInstructionNode;

			expect(onbuild.type).toBe("OnbuildInstruction");
			expect(trigger.type).toBe("CopyInstruction");
			expect(trigger.keyword).toBe("COPY");

			// The trigger starts at its own keyword.
			expect(trigger.start).toBe(8);
			expect(trigger.destination?.value).toBe("/app");
		});

		it("should not convert a nested ONBUILD trigger", () => {
			const text = `${"ONBUILD ".repeat(5000)}RUN make\n`;
			const onbuild = parseDocker(text).ast
				.body[0] as OnbuildInstructionNode;

			expect(onbuild.trigger).toBeNull();
		});

		it("should handle a missing trigger", () => {
			const { ast } = parseDocker("ONBUILD\n");
			const onbuild = ast.body[0] as OnbuildInstructionNode;

			expect(onbuild.trigger).toBeNull();
		});
	});

	describe("other instructions", () => {
		it("should parse MAINTAINER arguments", () => {
			const { ast } = parseDocker(
				"MAINTAINER Jane Doe <jane@example.com>\n",
			);
			const maintainer = ast.body[0] as MaintainerInstructionNode;

			expect(maintainer.type).toBe("MaintainerInstruction");
			expect(
				maintainer.arguments.map(argument => argument.value),
			).toEqual(["Jane", "Doe", "<jane@example.com>"]);
		});

		it("should fall back to GenericInstruction for unknown keywords", () => {
			const { ast } = parseDocker("BOGUS one two\n");
			const generic = ast.body[0] as GenericInstructionNode;

			expect(generic.type).toBe("GenericInstruction");
			expect(generic.keyword).toBe("BOGUS");
			expect(generic.arguments.map(argument => argument.value)).toEqual([
				"one",
				"two",
			]);
		});

		it("should canonicalize lowercase keywords", () => {
			const { ast } = parseDocker("from node:20\nrun echo hi\n");

			expect(ast.body[0]?.keyword).toBe("FROM");
			expect(ast.body[1]?.keyword).toBe("RUN");
		});
	});
});
