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
	});
});
