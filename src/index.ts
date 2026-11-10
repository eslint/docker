/**
 * @fileoverview The @eslint/docker plugin: a Dockerfile language definition
 * for ESLint, best-practice rules inspired by hadolint and the Docker
 * documentation, and a recommended configuration.
 * @author Claude Fable 5
 */

//------------------------------------------------------------------------------
// Plugin
//------------------------------------------------------------------------------

const plugin = {
	meta: {
		name: "@eslint/docker",
		namespace: "docker",
		version: "0.1.0", // x-release-please-version
	},
};

//------------------------------------------------------------------------------
// Exports
//------------------------------------------------------------------------------

export default plugin;
