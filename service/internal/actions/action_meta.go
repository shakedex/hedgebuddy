package actions

import (
	"fmt"
	"time"
)

// Meta methods for all action types. Each returns its own ActionMeta so the
// registry can collect them automatically via AllMeta().

func (a *HTTPPostAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "http.post", Category: "http", Description: "Send an HTTP POST request",
		Inputs: []InputMeta{
			{Name: "url", Type: "url", Required: true, Description: "Target URL"},
			{Name: "body", Type: "string", Required: false, Description: "Request body (JSON string)"},
			{Name: "headers", Type: "string", Required: false, Description: "HTTP headers as JSON object"},
		},
	}
}

func (a *HTTPGetAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "http.get", Category: "http", Description: "Send an HTTP GET request",
		Inputs: []InputMeta{
			{Name: "url", Type: "url", Required: true, Description: "Target URL"},
			{Name: "headers", Type: "string", Required: false, Description: "HTTP headers as JSON object"},
		},
	}
}

func (a *FileMoveAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "file.move", Category: "file", Description: "Move a file or directory",
		Inputs: []InputMeta{
			{Name: "source", Type: "path", Required: true, Description: "Source file/directory path"},
			{Name: "destination", Type: "path", Required: true, Description: "Destination path"},
		},
	}
}

func (a *FileCopyAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "file.copy", Category: "file", Description: "Copy a file",
		Inputs: []InputMeta{
			{Name: "source", Type: "path", Required: true, Description: "Source file path"},
			{Name: "destination", Type: "path", Required: true, Description: "Destination path"},
		},
	}
}

func (a *FileWriteAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "file.write", Category: "file", Description: "Write text to a file (overwrite)",
		Inputs: []InputMeta{
			{Name: "path", Type: "path", Required: true, Description: "File path to write to"},
			{Name: "content", Type: "string", Required: true, Description: "Content to write"},
		},
	}
}

func (a *FileAppendAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "file.append", Category: "file", Description: "Append text to a file",
		Inputs: []InputMeta{
			{Name: "path", Type: "path", Required: true, Description: "File path to append to"},
			{Name: "content", Type: "string", Required: true, Description: "Content to append"},
		},
	}
}

func (a *LogWriteAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "log.write", Category: "logging", Description: "Write a timestamped log entry",
		Inputs: []InputMeta{
			{Name: "message", Type: "string", Required: true, Description: "Log message"},
			{Name: "path", Type: "path", Required: false, Description: "Log file path (optional, defaults to stdout)"},
		},
	}
}

func (a *TemplateRenderAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "template.render", Category: "logic", Description: "Render a template with event/step data",
		Inputs: []InputMeta{
			{Name: "template", Type: "string", Required: true, Description: "Template string with {{event.field}} placeholders"},
		},
	}
}

func (a *ConditionMatchAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "condition.match", Category: "logic", Description: "Check a condition — stops the chain if not met",
		Inputs: []InputMeta{
			{Name: "field", Type: "string", Required: true, Description: "Event payload field to check"},
			{Name: "op", Type: "enum", Required: true, Description: "Comparison operator",
				Values: []string{"eq", "neq", "contains", "not_contains", "starts_with", "ends_with", "gt", "lt", "empty", "not_empty", "in"}},
			{Name: "value", Type: "string", Required: false, Description: "Expected value (for eq, contains, etc.)"},
		},
	}
}

func (a *OffShootOpenAction) Meta() ActionMeta {
	return ActionMeta{Name: "offshoot.open", Category: "offshoot", Description: "Open/focus OffShoot", Inputs: []InputMeta{}}
}

func (a *OffShootQuitAction) Meta() ActionMeta {
	return ActionMeta{Name: "offshoot.quit", Category: "offshoot", Description: "Quit OffShoot", Inputs: []InputMeta{}}
}

func (a *OffShootSetSourceAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "offshoot.setSource", Category: "offshoot", Description: "Set source paths in OffShoot",
		Inputs: []InputMeta{
			{Name: "paths", Type: "string", Required: true, Description: "JSON array of source paths"},
			{Name: "label", Type: "string", Required: false, Description: "Label for the source"},
		},
	}
}

func (a *OffShootSetDestinationAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "offshoot.setDestination", Category: "offshoot", Description: "Set destination path in OffShoot",
		Inputs: []InputMeta{
			{Name: "path", Type: "path", Required: true, Description: "Destination folder path"},
		},
	}
}

func (a *OffShootAddTransfersAction) Meta() ActionMeta {
	return ActionMeta{Name: "offshoot.addTransfers", Category: "offshoot", Description: "Start queued transfers in OffShoot", Inputs: []InputMeta{}}
}

func (a *OffShootResetAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "offshoot.reset", Category: "offshoot", Description: "Remove disks from OffShoot dropzones",
		Inputs: []InputMeta{
			{Name: "type", Type: "enum", Required: false, Description: "Which dropzones to reset", Values: []string{"sources", "destinations"}},
		},
	}
}

func (a *OffShootReloadPresetsAction) Meta() ActionMeta {
	return ActionMeta{Name: "offshoot.reloadPresets", Category: "offshoot", Description: "Reload preset files in OffShoot", Inputs: []InputMeta{}}
}

func (a *OffShootChainAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "offshoot.chain", Category: "offshoot", Description: "Send chained actions to OffShoot",
		Inputs: []InputMeta{
			{Name: "json", Type: "string", Required: true, Description: "JSON array of OffShoot actions"},
		},
	}
}

func (a *FoolCatOpenAction) Meta() ActionMeta {
	return ActionMeta{Name: "foolcat.open", Category: "foolcat", Description: "Open/focus FoolCat", Inputs: []InputMeta{}}
}

func (a *FoolCatCreateAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "foolcat.create", Category: "foolcat", Description: "Create a report in FoolCat",
		Inputs: []InputMeta{
			{Name: "source", Type: "path", Required: true, Description: "Source folder path"},
			{Name: "destination", Type: "path", Required: true, Description: "Destination folder path"},
			{Name: "name", Type: "string", Required: false, Description: "Report name"},
			{Name: "description", Type: "string", Required: false, Description: "Report description"},
		},
	}
}

func (a *EditReadyOpenAction) Meta() ActionMeta {
	return ActionMeta{Name: "editready.open", Category: "editready", Description: "Open/focus EditReady", Inputs: []InputMeta{}}
}

func (a *EditReadyAddAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "editready.add", Category: "editready", Description: "Add clips to EditReady",
		Inputs: []InputMeta{
			{Name: "sourcePath", Type: "path", Required: true, Description: "File or folder path to add"},
		},
	}
}

func (a *EditReadyTranscodeAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "editready.transcode", Category: "editready", Description: "Start transcoding in EditReady",
		Inputs: []InputMeta{
			{Name: "sourcePath", Type: "path", Required: true, Description: "Source file or folder path"},
			{Name: "preset", Type: "string", Required: false, Description: "Preset name, path, or UUID"},
			{Name: "destinationPath", Type: "path", Required: false, Description: "Output folder path"},
		},
	}
}

// DelayWaitAction pauses execution for a specified duration.
type DelayWaitAction struct{}

func (a *DelayWaitAction) Name() string { return "delay.wait" }

func (a *DelayWaitAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "delay.wait", Category: "delay", Description: "Wait for a specified duration",
		Inputs: []InputMeta{
			{Name: "duration", Type: "string", Required: true, Description: "Wait duration (e.g. 5s, 1m, 500ms)"},
		},
	}
}

func (a *DelayWaitAction) Execute(config map[string]any, ctx *Context) Result {
	durStr, _ := config["duration"].(string)
	if durStr == "" {
		return Result{Error: "delay.wait: duration is required", OK: false}
	}

	d, err := time.ParseDuration(durStr)
	if err != nil {
		return Result{Error: fmt.Sprintf("delay.wait: invalid duration %q: %v", durStr, err), OK: false}
	}

	time.Sleep(d)
	return Result{OK: true, Output: map[string]any{"waited": durStr}}
}

func (a *ShellExecAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "shell.exec", Category: "shell", Description: "Execute an external command",
		Inputs: []InputMeta{
			{Name: "command", Type: "path", Required: true, Description: "Path to executable"},
			{Name: "args", Type: "string", Required: false, Description: "Positional arguments (array)"},
			{Name: "flags", Type: "string", Required: false, Description: "Boolean flags — included when value is true"},
			{Name: "options", Type: "string", Required: false, Description: "Key-value options — included as --key value when non-empty"},
			{Name: "timeout", Type: "string", Required: false, Description: "Execution timeout (e.g. 60s, 5m, 2h)", Default: "60s"},
			{Name: "working_dir", Type: "path", Required: false, Description: "Working directory for the subprocess"},
		},
	}
}
