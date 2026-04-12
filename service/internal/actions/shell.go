package actions

import (
	"context"
	"fmt"
	"os/exec"
	"sort"
	"strings"
	"time"
)

// ShellExecAction executes an external command as a subprocess.
// It uses exec.Command directly (no shell interpretation) for safety.
type ShellExecAction struct{}

func (a *ShellExecAction) Name() string { return "shell.exec" }

func (a *ShellExecAction) Execute(config map[string]any, ctx *Context) Result {
	command, _ := config["command"].(string)
	if command == "" {
		return Result{Error: "shell.exec: command is required", OK: false}
	}

	// Parse timeout (default 60s).
	timeoutStr, _ := config["timeout"].(string)
	if timeoutStr == "" {
		timeoutStr = "60s"
	}
	timeout, err := time.ParseDuration(timeoutStr)
	if err != nil {
		return Result{Error: fmt.Sprintf("shell.exec: invalid timeout %q: %v", timeoutStr, err), OK: false}
	}

	// Build argument list.
	var finalArgs []string

	// 1. Positional args — always included.
	if rawArgs, ok := config["args"]; ok {
		if arr, ok := rawArgs.([]any); ok {
			for _, v := range arr {
				if s := fmt.Sprintf("%v", v); s != "" {
					finalArgs = append(finalArgs, s)
				}
			}
		}
	}

	// 2. Flags — included only when value is "true" (case-insensitive).
	if rawFlags, ok := config["flags"]; ok {
		if flags, ok := rawFlags.(map[string]any); ok {
			// Sort keys for deterministic argument order.
			keys := make([]string, 0, len(flags))
			for k := range flags {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				v := fmt.Sprintf("%v", flags[k])
				if strings.EqualFold(v, "true") {
					finalArgs = append(finalArgs, k)
				}
			}
		}
	}

	// 3. Options — included as --key value pairs when value is non-empty.
	if rawOpts, ok := config["options"]; ok {
		if opts, ok := rawOpts.(map[string]any); ok {
			// Sort keys for deterministic argument order.
			keys := make([]string, 0, len(opts))
			for k := range opts {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				v := strings.TrimSpace(fmt.Sprintf("%v", opts[k]))
				if v != "" {
					finalArgs = append(finalArgs, k, v)
				}
			}
		}
	}

	// Create command with timeout context.
	execCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(execCtx, command, finalArgs...)

	// Set working directory if provided.
	if dir, _ := config["working_dir"].(string); dir != "" {
		cmd.Dir = dir
	}

	// Execute and capture output.
	out, execErr := cmd.CombinedOutput()
	stdout := string(out)
	exitCode := 0
	if execErr != nil {
		if exitErr, ok := execErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			return Result{
				Error: fmt.Sprintf("shell.exec: %v", execErr),
				OK:    false,
				Output: map[string]any{
					"stdout":    stdout,
					"exit_code": -1,
				},
			}
		}
	}

	output := map[string]any{
		"stdout":    stdout,
		"exit_code": exitCode,
	}

	if exitCode != 0 {
		return Result{
			Error:  fmt.Sprintf("shell.exec: command exited with code %d", exitCode),
			OK:     false,
			Output: output,
		}
	}

	return Result{OK: true, Output: output}
}
