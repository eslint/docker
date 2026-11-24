/**
 * @fileoverview The DockerFileSourceCode class, the SourceCode implementation
 * that ESLint uses to interact with a parsed Dockerfile.
 */

import {
	ConfigCommentParser,
	Directive,
	TextSourceCodeBase,
	VisitNodeStep,
} from "@eslint/plugin-kit";
import type {
	DirectiveType,
	FileProblem,
	RulesConfig,
	SourceLocation,
	SourceRange,
	TraversalStep,
} from "@eslint/core";
import { visitorKeys } from "../visitor-keys.js";
import type {
	CommentNode,
	DockerFileLanguageOptions,
	DockerNode,
	DockerfileNode,
} from "../types.js";

const commentParser = new ConfigCommentParser();

const INLINE_CONFIG =
	/^\s*eslint(?:-enable|-disable(?:(?:-next)?-line)?)?(?:\s|$)/u;

/**
 * The directive labels ESLint understands, mapped to directive types.
 */
const DIRECTIVE_TYPES = new Map<string, DirectiveType>([
	["eslint-disable", "disable"],
	["eslint-enable", "enable"],
	["eslint-disable-line", "disable-line"],
	["eslint-disable-next-line", "disable-next-line"],
]);

export interface DockerFileSourceCodeOptions {
	text: string;
	ast: DockerfileNode;
}

/**
 * SourceCode implementation for Dockerfiles. Nodes carry `start`/`end`
 * character offsets; `getLoc()` and `getRange()` derive positions from
 * those offsets, so nodes have no `loc` or `range` properties.
 */
export class DockerFileSourceCode extends TextSourceCodeBase<{
	LangOptions: DockerFileLanguageOptions;
	RootNode: DockerfileNode;
	SyntaxElementWithLoc: DockerNode;
	ConfigNode: CommentNode;
}> {
	/** All comments found in the file, in source order. */
	comments: CommentNode[];

	#parents = new Map<DockerNode, DockerNode>();
	#steps: VisitNodeStep[] | null = null;
	#lineOffsets: number[] | null = null;
	#inlineConfigComments: CommentNode[] | null = null;

	/**
	 * Creates a new instance.
	 * @param options The options for the source code.
	 * @param options.text The source text of the file.
	 * @param options.ast The root node of the file's syntax tree.
	 */
	constructor({ text, ast }: DockerFileSourceCodeOptions) {
		super({ text, ast });
		this.comments = ast.comments;
	}

	/**
	 * Character offsets at which each line starts, computed on first
	 * access.
	 * @returns The offset of the start of each line, in line order.
	 */
	get #lineStarts(): number[] {
		if (!this.#lineOffsets) {
			const offsets = [0];

			for (let i = 0; i < this.text.length; i++) {
				if (this.text[i] === "\n") {
					offsets.push(i + 1);
				}
			}

			this.#lineOffsets = offsets;
		}

		return this.#lineOffsets;
	}

	/**
	 * Converts a character offset into a 1-based line/column pair.
	 * @param index The character offset to convert.
	 * @returns The 1-based line and column of the offset.
	 */
	#locFromIndex(index: number): { line: number; column: number } {
		const lineStarts = this.#lineStarts;
		let low = 0;
		let high = lineStarts.length - 1;

		while (low < high) {
			const mid = (low + high + 1) >> 1;

			if ((lineStarts[mid] as number) <= index) {
				low = mid;
			} else {
				high = mid - 1;
			}
		}

		return {
			line: low + 1,
			column: index - (lineStarts[low] as number) + 1,
		};
	}

	/**
	 * Returns the location of a node.
	 * @param node The node to locate.
	 * @returns The 1-based start and end line/column of the node.
	 */
	getLoc(node: DockerNode): SourceLocation {
		return {
			start: this.#locFromIndex(node.start),
			end: this.#locFromIndex(node.end),
		};
	}

	/**
	 * Returns the character range of a node.
	 * @param node The node whose range to return.
	 * @returns The start (inclusive) and end (exclusive) offsets of the
	 * node.
	 */
	getRange(node: DockerNode): SourceRange {
		return [node.start, node.end];
	}

	/**
	 * Returns the parent of a node.
	 * @param node The node whose parent to return.
	 * @returns The parent node, or `undefined` for the root node or a node
	 * that is not in the tree.
	 */
	getParent(node: DockerNode): DockerNode | undefined {
		this.#ensureTraversed();
		return this.#parents.get(node);
	}

	/**
	 * Traverses the tree if it has not been traversed yet, so that parent
	 * links are available.
	 */
	#ensureTraversed(): void {
		if (!this.#steps) {
			void [...this.traverse()];
		}
	}

	/**
	 * Returns the steps of a depth-first traversal of the tree, recording
	 * the parent of each node along the way. The steps are computed once
	 * and reused.
	 * @returns An enter and an exit step for each node, in traversal order.
	 */
	traverse(): Iterable<TraversalStep> {
		if (this.#steps) {
			return this.#steps.values();
		}

		const steps: VisitNodeStep[] = (this.#steps = []);

		/**
		 * Records the steps for a node and its descendants.
		 * @param node The node to visit.
		 * @param parent The parent of the node, or `undefined` for the root.
		 */
		const visit = (
			node: DockerNode,
			parent: DockerNode | undefined,
		): void => {
			if (parent) {
				this.#parents.set(node, parent);
			}

			steps.push(
				new VisitNodeStep({
					target: node,
					phase: 1,
					args: [node, parent],
				}),
			);

			for (const key of visitorKeys[node.type] ?? []) {
				const child = (node as unknown as Record<string, unknown>)[key];

				if (Array.isArray(child)) {
					for (const element of child) {
						if (element) {
							visit(element as DockerNode, node);
						}
					}
				} else if (child) {
					visit(child as DockerNode, node);
				}
			}

			steps.push(
				new VisitNodeStep({
					target: node,
					phase: 2,
					args: [node, parent],
				}),
			);
		};

		visit(this.ast, undefined);

		return steps.values();
	}

	/**
	 * Returns all comments that look like inline ESLint configuration.
	 * @returns The matching comments, in source order.
	 */
	getInlineConfigNodes(): CommentNode[] {
		if (!this.#inlineConfigComments) {
			this.#inlineConfigComments = this.comments.filter(comment =>
				INLINE_CONFIG.test(comment.text),
			);
		}

		return this.#inlineConfigComments;
	}

	/**
	 * Returns directives for disabling/enabling rules found in comments,
	 * such as `# eslint-disable-next-line docker/no-maintainer`.
	 * @returns The directives, and any problems found while reading them.
	 */
	getDisableDirectives(): {
		directives: Directive[];
		problems: FileProblem[];
	} {
		const directives: Directive[] = [];
		const problems: FileProblem[] = [];

		for (const comment of this.getInlineConfigNodes()) {
			const parsed = commentParser.parseDirective(comment.text.trim());

			if (!parsed) {
				continue;
			}

			const directiveType = DIRECTIVE_TYPES.get(parsed.label);

			if (!directiveType) {
				continue;
			}

			directives.push(
				new Directive({
					type: directiveType,
					node: comment,
					value: parsed.value,
					justification: parsed.justification,
				}),
			);
		}

		return { directives, problems };
	}

	/**
	 * Applies `# eslint rule: severity` configuration comments.
	 * @returns The rule configuration from each comment with its location,
	 * and a problem for each comment that could not be parsed.
	 */
	applyInlineConfig(): {
		configs: { config: { rules: RulesConfig }; loc: SourceLocation }[];
		problems: FileProblem[];
	} {
		const configs: {
			config: { rules: RulesConfig };
			loc: SourceLocation;
		}[] = [];
		const problems: FileProblem[] = [];

		for (const comment of this.getInlineConfigNodes()) {
			const parsed = commentParser.parseDirective(comment.text.trim());

			if (!parsed || parsed.label !== "eslint") {
				continue;
			}

			const parseResult = commentParser.parseJSONLikeConfig(parsed.value);

			if (parseResult.ok) {
				configs.push({
					config: { rules: parseResult.config },
					loc: this.getLoc(comment),
				});
			} else {
				problems.push({
					ruleId: null,
					message: parseResult.error.message,
					loc: this.getLoc(comment),
				});
			}
		}

		return { configs, problems };
	}
}
