/**
 * @fileoverview Tests for the plugin entry point.
 * @author Claude Fable 5
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import plugin from "./index.js";
import { DockerLanguage } from "./languages/docker-language.js";

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("plugin", () => {
	it("should expose plugin metadata", () => {
		expect(plugin.meta.name).toBe("@eslint/docker");
		expect(plugin.meta.namespace).toBe("docker");
		expect(plugin.meta.version).toMatch(/^\d+\.\d+\.\d+$/u);
	});

	it("should expose the dockerfile language", () => {
		expect(plugin.languages.dockerfile).toBeInstanceOf(DockerLanguage);
	});

	it("should expose all rules", () => {
		const ruleIds = Object.keys(plugin.rules);

		expect(ruleIds.sort()).toEqual(["consistent-instruction-casing"]);
	});

	it("should give every rule meta docs and messages", () => {
		for (const [ruleId, rule] of Object.entries(plugin.rules)) {
			expect(rule.meta?.docs?.description, ruleId).toBeTruthy();
			expect(rule.meta?.docs?.recommended, ruleId).toBe(true);
			expect(rule.meta?.messages, ruleId).toBeTruthy();
			expect(rule.meta?.schema, ruleId).toBeDefined();
			expect(rule.meta?.docs?.url, ruleId).toBe(
				`https://github.com/eslint/docker/blob/main/docs/rules/${ruleId}.md`,
			);
			expect(typeof rule.create, ruleId).toBe("function");
		}
	});

	describe("recommended config", () => {
		const recommended = plugin.configs.recommended;

		it("should reference the plugin itself", () => {
			expect(recommended.plugins).toHaveProperty("docker", plugin);
		});

		it("should use the dockerfile language for Dockerfiles", () => {
			expect(recommended.language).toBe("docker/dockerfile");
			expect(recommended.files).toContain("**/Dockerfile");
			expect(recommended.files).toContain("**/Dockerfile.*");
			expect(recommended.files).toContain("**/*.dockerfile");
			expect(recommended.files).toContain("**/Containerfile");
		});

		it("should configure every rule", () => {
			const configured = Object.keys(recommended.rules).sort();
			const expected = Object.keys(plugin.rules)
				.map(ruleId => `docker/${ruleId}`)
				.sort();

			expect(configured).toEqual(expected);
		});
	});
});
