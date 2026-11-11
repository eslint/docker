/**
 * @fileoverview Type-level tests for the exported configurations.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import type { Linter } from "eslint";
import { describe, expectTypeOf, it } from "vitest";
import docker from "../src/index.js";

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("configs", () => {
	it("should type recommended rule severities as ESLint severities", () => {
		expectTypeOf(
			docker.configs.recommended.rules,
		).toMatchTypeOf<Linter.RulesRecord>();
	});
});
