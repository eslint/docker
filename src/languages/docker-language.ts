/**
 * @fileoverview The DockerFileLanguage class, the ESLint Language implementation
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
import { DockerFileSourceCode } from "./docker-source-code.js";
import { visitorKeys } from "../visitor-keys.js";
import type {
	DockerFileLanguageOptions,
	DockerNode,
	DockerfileNode,
} from "../types.js";

/**
 * ESLint Language implementation for Dockerfiles.
 */
export class DockerFileLanguage implements Language<{
	LangOptions: DockerFileLanguageOptions;
	Code: DockerFileSourceCode;
	RootNode: DockerfileNode;
	Node: DockerNode;
}> {
	fileType = "text" as const;
	lineStart = 1 as const;
	columnStart = 1 as const;
	nodeTypeKey = "type";
	visitorKeys = visitorKeys;

	defaultLanguageOptions: DockerFileLanguageOptions = {};

	validateLanguageOptions(_languageOptions: DockerFileLanguageOptions): void {
		// The Docker language currently has no options. By convention,
		// unknown language options are ignored rather than rejected.
	}

	parse(
		file: File,
		_context?: LanguageContext<DockerFileLanguageOptions>,
	): ParseResult<DockerfileNode> {
		const text = file.body as string;

		try {
			// The Dockerfile parser is error-tolerant and never throws for
			// malformed input, so parsing always succeeds.
			const { ast } = parseDocker(text);

			return { ok: true, ast };
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
		parseResult: OkParseResult<DockerfileNode>,
	): DockerFileSourceCode {
		return new DockerFileSourceCode({
			text: file.body as string,
			ast: parseResult.ast,
		});
	}
}
