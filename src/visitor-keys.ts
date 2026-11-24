/**
 * @fileoverview Visitor keys describing the traversal order of the
 * Dockerfile syntax tree. Keys are listed in source order.
 */

export const visitorKeys: Record<string, string[]> = Object.freeze({
	Dockerfile: ["body"],
	Comment: [],
	ParserDirective: [],

	// Instructions
	FromInstruction: ["flags", "image", "alias"],
	RunInstruction: ["flags", "command"],
	CmdInstruction: ["command"],
	EntrypointInstruction: ["command"],
	ShellInstruction: ["command"],
	CopyInstruction: ["flags", "sources", "destination"],
	AddInstruction: ["flags", "sources", "destination"],
	EnvInstruction: ["pairs"],
	ArgInstruction: ["pairs"],
	LabelInstruction: ["pairs"],
	WorkdirInstruction: ["path"],
	UserInstruction: ["user"],
	ExposeInstruction: ["ports"],
	VolumeInstruction: ["paths"],
	StopsignalInstruction: ["signal"],
	HealthcheckInstruction: ["flags", "subcommand", "arguments"],
	OnbuildInstruction: ["trigger"],
	MaintainerInstruction: ["arguments"],
	GenericInstruction: ["arguments"],

	// Shared pieces
	Argument: [],
	Flag: [],
	KeyValuePair: ["key", "value"],
	ImageReference: [],
	StageName: [],
	ShellForm: ["arguments"],
	ExecForm: ["elements"],
});
