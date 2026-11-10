/**
 * @fileoverview Tests for the DockerLanguage class.
 */

import { describe, expect, it } from "vitest";
import { DockerLanguage } from "./docker-language.js";
import { DockerSourceCode } from "./docker-source-code.js";
import type { DockerOkParseResult } from "./docker-language.js";

const language = new DockerLanguage();

describe("DockerLanguage", () => {
	it("should describe itself as a 1-based text language", () => {
		expect(language.fileType).toBe("text");
		expect(language.lineStart).toBe(1);
		expect(language.columnStart).toBe(1);
		expect(language.nodeTypeKey).toBe("type");
		expect(language.visitorKeys).toBeTruthy();
	});

	describe("validateLanguageOptions", () => {
		it("should accept an empty object", () => {
			expect(() => language.validateLanguageOptions({})).not.toThrow();
		});

		it("should reject unknown options", () => {
			expect(() =>
				language.validateLanguageOptions({ variant: "podman" }),
			).toThrow(/Unknown language option "variant"/u);
		});
	});

	describe("parse", () => {
		it("should parse a Dockerfile into an ast with comments", () => {
			const result = language.parse({
				body: "# start\nFROM node:20\n",
				path: "Dockerfile",
				physicalPath: "Dockerfile",
				bom: false,
			});

			expect(result.ok).toBe(true);

			const okResult = result as DockerOkParseResult;

			expect(okResult.ast.type).toBe("Dockerfile");
			expect(okResult.ast.body).toHaveLength(1);
			expect(okResult.comments).toHaveLength(1);
		});

		it("should parse malformed input without fatal errors", () => {
			const result = language.parse({
				body: "THIS IS NOT [ VALID \\ anything\n\t%%",
				path: "Dockerfile",
				physicalPath: "Dockerfile",
				bom: false,
			});

			expect(result.ok).toBe(true);
		});

		it("should report unexpected parser exceptions as errors", () => {
			const result = language.parse({
				body: null as never,
				path: "Dockerfile",
				physicalPath: "Dockerfile",
				bom: false,
			});

			expect(result.ok).toBe(false);

			if (!result.ok) {
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0]).toMatchObject({ line: 1, column: 1 });
			}
		});
	});

	describe("createSourceCode", () => {
		it("should create a DockerSourceCode from a parse result", () => {
			const file = {
				body: "FROM node:20\n",
				path: "Dockerfile",
				physicalPath: "Dockerfile",
				bom: false,
			};
			const result = language.parse(file) as DockerOkParseResult;
			const sourceCode = language.createSourceCode(file, result);

			expect(sourceCode).toBeInstanceOf(DockerSourceCode);
			expect(sourceCode.text).toBe(file.body);
			expect(sourceCode.ast).toBe(result.ast);
		});
	});
});
