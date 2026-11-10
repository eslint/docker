/**
 * @fileoverview The @eslint/docker plugin: a Dockerfile language definition
 * for ESLint, best-practice rules inspired by hadolint and the Docker
 * documentation, and a recommended configuration.
 * @author Claude Fable 5
 */

//------------------------------------------------------------------------------
// Plugin
//------------------------------------------------------------------------------
import { DockerLanguage } from "./languages/docker-language.js";
import consistentInstructionCasing from "./rules/consistent-instruction-casing.js";
import noAptGetUpgrade from "./rules/no-apt-get-upgrade.js";
import noCdInRun from "./rules/no-cd-in-run.js";
import noDuplicateInstructions from "./rules/no-duplicate-instructions.js";
import noMaintainer from "./rules/no-maintainer.js";
import noSudo from "./rules/no-sudo.js";

const rules = {
	"consistent-instruction-casing": consistentInstructionCasing,
	"no-apt-get-upgrade": noAptGetUpgrade,
	"no-cd-in-run": noCdInRun,
	"no-duplicate-instructions": noDuplicateInstructions,
	"no-maintainer": noMaintainer,
	"no-sudo": noSudo,
};

const plugin = {
	meta: {
		name: "@eslint/docker",
		namespace: "docker",
		version: "0.0.0", // x-release-please-version
	},
	languages: {
		dockerfile: new DockerLanguage(),
	},
	rules,
	configs: {
		recommended: {
			name: "docker/recommended",
			files: [
				"**/Dockerfile",
				"**/Dockerfile.*",
				"**/*.dockerfile",
				"**/Containerfile",
			],
			language: "docker/dockerfile",
			plugins: {},
			rules: {
				"docker/consistent-instruction-casing": "error",
				"docker/no-apt-get-upgrade": "error",
				"docker/no-cd-in-run": "error",
				"docker/no-duplicate-instructions": "error",
				"docker/no-maintainer": "error",
				"docker/no-sudo": "error",
			} as const,
		},
	},
};

//------------------------------------------------------------------------------
// Exports
//------------------------------------------------------------------------------

// The recommended config must reference the plugin itself.
Object.assign(plugin.configs.recommended.plugins, { docker: plugin });

export default plugin;
export { DockerLanguage } from "./languages/docker-language.js";
export { DockerSourceCode } from "./languages/docker-source-code.js";
export { parseDocker } from "./parser/parse.js";
export { visitorKeys } from "./visitor-keys.js";
export { INSTRUCTION_TYPES } from "./types.js";
export type * from "./types.js";
