/**
 * @fileoverview Rule to require FROM images to be pinned to an explicit
 * tag or digest, and to disallow the `latest` tag.
 */

//------------------------------------------------------------------------------
// Imports
//------------------------------------------------------------------------------

import type { DockerRuleDefinition } from "../types.js";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: DockerRuleDefinition<{
	MessageIds: "missingTag" | "latestTag";
}> = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require base images to be pinned to an explicit tag or digest",
			recommended: true,
			url: "https://github.com/eslint/docker/blob/main/docs/rules/require-image-tag.md",
		},
		schema: [],
		messages: {
			missingTag:
				"Pin the base image '{{image}}' to an explicit tag or digest.",
			latestTag:
				"Do not use the 'latest' tag for base image '{{image}}'; pin to a specific version.",
		},
	},

	create(context) {
		const stageNames = new Set<string>();

		return {
			FromInstruction(node) {
				const { image, alias } = node;
				// A stage reference is a bare name: with a tag or digest
				// (`node:latest`), the image is pulled from a registry even
				// if an earlier stage has the same name.
				const isStageReference =
					image !== null &&
					image.tag === null &&
					image.digest === null &&
					stageNames.has(image.name.toLowerCase());

				if (alias) {
					stageNames.add(alias.name.toLowerCase());
				}

				if (!image || isStageReference) {
					return;
				}

				// Variable references and the reserved scratch image cannot
				// be checked.
				if (image.name.includes("$") || image.name === "scratch") {
					return;
				}

				if (image.digest !== null) {
					return;
				}

				if (image.tag === null) {
					context.report({
						node: image,
						messageId: "missingTag",
						data: { image: image.name },
					});
				} else if (image.tag === "latest") {
					context.report({
						node: image,
						messageId: "latestTag",
						data: { image: image.name },
					});
				}
			},
		};
	},
};

export default rule;
