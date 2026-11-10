/**
 * @fileoverview Unit tests for the visitor keys.
 */

import { describe, expect, it } from "vitest";
import { visitorKeys } from "./visitor-keys.js";
import { INSTRUCTION_TYPES } from "./types.js";

describe("visitorKeys", () => {
	it("should be frozen", () => {
		expect(Object.isFrozen(visitorKeys)).toBe(true);
	});

	it("should map every node type to an array of strings", () => {
		for (const [type, keys] of Object.entries(visitorKeys)) {
			expect(Array.isArray(keys), `keys for ${type}`).toBe(true);

			for (const key of keys) {
				expect(typeof key).toBe("string");
			}
		}
	});

	it("should contain all node types", () => {
		const expected = [
			"Dockerfile",
			"Comment",
			"ParserDirective",
			...INSTRUCTION_TYPES,
			"Argument",
			"Flag",
			"KeyValuePair",
			"ImageReference",
			"StageName",
			"ShellForm",
			"ExecForm",
		];

		for (const type of expected) {
			expect(visitorKeys, `missing ${type}`).toHaveProperty(type);
		}

		expect(Object.keys(visitorKeys)).toHaveLength(expected.length);
	});

	it("should not traverse leaf nodes", () => {
		expect(visitorKeys.Argument).toEqual([]);
		expect(visitorKeys.Flag).toEqual([]);
		expect(visitorKeys.Comment).toEqual([]);
		expect(visitorKeys.ImageReference).toEqual([]);
		expect(visitorKeys.StageName).toEqual([]);
		expect(visitorKeys.ParserDirective).toEqual([]);
	});
});
