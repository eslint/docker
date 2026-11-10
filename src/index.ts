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

const plugin = {
	meta: {
		name: "@eslint/docker",
		namespace: "docker",
		version: "0.0.0", // x-release-please-version
	},
	languages: {
		dockerfile: new DockerLanguage(),
	},
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
			rules: {},
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
