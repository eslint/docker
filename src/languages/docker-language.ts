/**
 * @fileoverview The DockerLanguage class, the ESLint Language implementation
 * for Dockerfiles.
 */

import type {
	File,
	Language,
	LanguageContext,
	OkParseResult,
	ParseResult,
} from "@eslint/core";
import { parseDocker } from "../parser/parse.js";
import { DockerSourceCode } from "./docker-source-code.js";
import { visitorKeys } from "../visitor-keys.js";
import type {
	CommentNode,
	DockerLanguageOptions,
	DockerNode,
	DockerfileNode,
} from "../types.js";

export type DockerOkParseResult = OkParseResult<DockerfileNode> & {
	comments: CommentNode[];
};

/**
 * ESLint Language implementation for Dockerfiles.
 */
export class DockerLanguage implements Language<{
	LangOptions: DockerLanguageOptions;
	Code: DockerSourceCode;
	RootNode: DockerfileNode;
	Node: DockerNode;
}> {
	fileType = "text" as const;
	lineStart = 1 as const;
	columnStart = 1 as const;
	nodeTypeKey = "type";
	visitorKeys = visitorKeys;

	defaultLanguageOptions: DockerLanguageOptions = {};

	validateLanguageOptions(languageOptions: DockerLanguageOptions): void {
		// The Docker language currently has no options.
		for (const key of Object.keys(languageOptions)) {
			throw new TypeError(`Unknown language option "${key}".`);
		}
	}

	parse(
		file: File,
		_context?: LanguageContext<DockerLanguageOptions>,
	): ParseResult<DockerfileNode> {
		const text = file.body as string;

		try {
			// The Dockerfile parser is error-tolerant and never throws for
			// malformed input, so parsing always succeeds.
			const { ast, comments } = parseDocker(text);

			return { ok: true, ast, comments };
		} catch (error) {
			return {
				ok: false,
				errors: [
					{
						message:
							error instanceof Error
								? error.message
								: String(error),
						line: 1,
						column: 1,
					},
				],
			};
		}
	}

	createSourceCode(
		file: File,
		parseResult: DockerOkParseResult,
	): DockerSourceCode {
		return new DockerSourceCode({
			text: file.body as string,
			ast: parseResult.ast,
		});
	}
}
