/**
 * @fileoverview Tests for the plugin entry point.
 * @author Claude Fable 5
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import plugin from "./index.js";

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("plugin", () => {
	it("should expose plugin metadata", () => {
		expect(plugin.meta.name).toBe("@eslint/docker");
		expect(plugin.meta.namespace).toBe("docker");
		expect(plugin.meta.version).toMatch(/^\d+\.\d+\.\d+$/u);
	});
});
