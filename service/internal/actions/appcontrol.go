package actions

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os/exec"
	"runtime"
	"strings"
)

// openURLScheme invokes a URL-scheme on the current OS.
func openURLScheme(u string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", u).Start()
	case "darwin":
		return exec.Command("open", u).Start()
	default:
		return exec.Command("xdg-open", u).Start()
	}
}

// buildSchemeURL constructs a URL like "offshoot://setSource?paths=[...]&label=test"
func buildSchemeURL(scheme, action string, params map[string]string) string {
	u := scheme + "://" + action
	if len(params) == 0 {
		return u
	}
	q := url.Values{}
	for k, v := range params {
		q.Set(k, v)
	}
	return u + "?" + q.Encode()
}

// --- OffShoot actions ---

// OffShootSetSourceAction sets source paths in OffShoot.
type OffShootSetSourceAction struct{}

func (a *OffShootSetSourceAction) Name() string { return "offshoot.setSource" }
func (a *OffShootSetSourceAction) Execute(config map[string]any, ctx *Context) Result {
	paths, _ := config["paths"].(string)
	label, _ := config["label"].(string)
	if paths == "" {
		return Result{Error: "offshoot.setSource: paths is required", OK: false}
	}
	// Accept either a JSON array or a plain path and wrap it.
	paths = strings.TrimSpace(paths)
	if !strings.HasPrefix(paths, "[") {
		paths = `["` + strings.ReplaceAll(paths, `\`, `\\`) + `"]`
	}
	params := map[string]string{"paths": paths}
	if label != "" {
		params["label"] = label
	}
	u := buildSchemeURL("offshoot", "setSource", params)
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("offshoot.setSource: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// OffShootSetDestinationAction sets a destination path in OffShoot.
type OffShootSetDestinationAction struct{}

func (a *OffShootSetDestinationAction) Name() string { return "offshoot.setDestination" }
func (a *OffShootSetDestinationAction) Execute(config map[string]any, ctx *Context) Result {
	path, _ := config["path"].(string)
	if path == "" {
		return Result{Error: "offshoot.setDestination: path is required", OK: false}
	}
	u := buildSchemeURL("offshoot", "setDestination", map[string]string{"path": path})
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("offshoot.setDestination: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// OffShootAddTransfersAction triggers transfer creation in OffShoot.
type OffShootAddTransfersAction struct{}

func (a *OffShootAddTransfersAction) Name() string { return "offshoot.addTransfers" }
func (a *OffShootAddTransfersAction) Execute(config map[string]any, ctx *Context) Result {
	u := buildSchemeURL("offshoot", "addTransfers", nil)
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("offshoot.addTransfers: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// OffShootResetAction removes disks from OffShoot dropzones.
type OffShootResetAction struct{}

func (a *OffShootResetAction) Name() string { return "offshoot.reset" }
func (a *OffShootResetAction) Execute(config map[string]any, ctx *Context) Result {
	params := map[string]string{}
	if t, ok := config["type"].(string); ok && t != "" {
		params["type"] = t
	}
	u := buildSchemeURL("offshoot", "reset", params)
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("offshoot.reset: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// OffShootOpenAction opens/focuses OffShoot.
type OffShootOpenAction struct{}

func (a *OffShootOpenAction) Name() string { return "offshoot.open" }
func (a *OffShootOpenAction) Execute(config map[string]any, ctx *Context) Result {
	u := buildSchemeURL("offshoot", "open", nil)
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("offshoot.open: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// OffShootQuitAction quits OffShoot.
type OffShootQuitAction struct{}

func (a *OffShootQuitAction) Name() string { return "offshoot.quit" }
func (a *OffShootQuitAction) Execute(config map[string]any, ctx *Context) Result {
	u := buildSchemeURL("offshoot", "quit", nil)
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("offshoot.quit: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// OffShootReloadPresetsAction reloads presets in OffShoot.
type OffShootReloadPresetsAction struct{}

func (a *OffShootReloadPresetsAction) Name() string { return "offshoot.reloadPresets" }
func (a *OffShootReloadPresetsAction) Execute(config map[string]any, ctx *Context) Result {
	u := buildSchemeURL("offshoot", "reloadPresets", nil)
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("offshoot.reloadPresets: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// OffShootChainAction sends a chained actions JSON payload to OffShoot.
type OffShootChainAction struct{}

func (a *OffShootChainAction) Name() string { return "offshoot.chain" }
func (a *OffShootChainAction) Execute(config map[string]any, ctx *Context) Result {
	actionsJSON, _ := config["json"].(string)
	if actionsJSON == "" {
		return Result{Error: "offshoot.chain: json is required", OK: false}
	}
	u := buildSchemeURL("offshoot", "actions", map[string]string{"json": actionsJSON})
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("offshoot.chain: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// --- FoolCat actions ---

// FoolCatOpenAction opens/focuses FoolCat.
type FoolCatOpenAction struct{}

func (a *FoolCatOpenAction) Name() string { return "foolcat.open" }
func (a *FoolCatOpenAction) Execute(config map[string]any, ctx *Context) Result {
	u := buildSchemeURL("foolcat", "open", nil)
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("foolcat.open: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// FoolCatCreateAction creates a report in FoolCat.
type FoolCatCreateAction struct{}

func (a *FoolCatCreateAction) Name() string { return "foolcat.create" }
func (a *FoolCatCreateAction) Execute(config map[string]any, ctx *Context) Result {
	source, _ := config["source"].(string)
	destination, _ := config["destination"].(string)
	if source == "" || destination == "" {
		return Result{Error: "foolcat.create: source and destination are required", OK: false}
	}
	params := map[string]string{"source": source, "destination": destination}
	if name, ok := config["name"].(string); ok && name != "" {
		params["name"] = name
	}
	if desc, ok := config["description"].(string); ok && desc != "" {
		params["description"] = desc
	}
	u := buildSchemeURL("foolcat", "create", params)
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("foolcat.create: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// --- EditReady actions ---

// EditReadyOpenAction opens/focuses EditReady.
type EditReadyOpenAction struct{}

func (a *EditReadyOpenAction) Name() string { return "editready.open" }
func (a *EditReadyOpenAction) Execute(config map[string]any, ctx *Context) Result {
	u := buildSchemeURL("editready", "open", nil)
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("editready.open: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// EditReadyAddAction adds clips to EditReady's clip view.
type EditReadyAddAction struct{}

func (a *EditReadyAddAction) Name() string { return "editready.add" }
func (a *EditReadyAddAction) Execute(config map[string]any, ctx *Context) Result {
	sourcePath, _ := config["sourcePath"].(string)
	if sourcePath == "" {
		return Result{Error: "editready.add: sourcePath is required", OK: false}
	}
	u := buildSchemeURL("editready", "add", map[string]string{"sourcePath": sourcePath})
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("editready.add: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// EditReadyTranscodeAction triggers a transcode job in EditReady.
type EditReadyTranscodeAction struct{}

func (a *EditReadyTranscodeAction) Name() string { return "editready.transcode" }
func (a *EditReadyTranscodeAction) Execute(config map[string]any, ctx *Context) Result {
	sourcePath, _ := config["sourcePath"].(string)
	destinationPath, _ := config["destinationPath"].(string)
	preset, _ := config["preset"].(string)
	if sourcePath == "" {
		return Result{Error: "editready.transcode: sourcePath is required", OK: false}
	}
	params := map[string]string{"sourcePath": sourcePath}
	if destinationPath != "" {
		params["destinationPath"] = destinationPath
	}
	if preset != "" {
		params["preset"] = preset
	}
	u := buildSchemeURL("editready", "transcode", params)
	if err := openURLScheme(u); err != nil {
		return Result{Error: fmt.Sprintf("editready.transcode: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"url": u}, OK: true}
}

// --- Condition action ---

// ConditionMatchAction evaluates a condition and returns OK=true if it passes.
// Use this to gate subsequent steps in a workflow.
type ConditionMatchAction struct{}

func (a *ConditionMatchAction) Name() string { return "condition.match" }
func (a *ConditionMatchAction) Execute(config map[string]any, ctx *Context) Result {
	field, _ := config["field"].(string)
	op, _ := config["op"].(string)
	expected, _ := config["value"].(string)

	if field == "" || op == "" {
		return Result{Error: "condition.match: field and op are required", OK: false}
	}

	// Resolve the field value from event payload.
	actual := ""
	if val, ok := ctx.Event[field]; ok {
		actual = fmt.Sprintf("%v", val)
	}

	matched := false
	switch strings.ToLower(op) {
	case "eq", "equals", "==":
		matched = actual == expected
	case "neq", "not_equals", "!=":
		matched = actual != expected
	case "contains":
		matched = strings.Contains(actual, expected)
	case "not_contains":
		matched = !strings.Contains(actual, expected)
	case "starts_with":
		matched = strings.HasPrefix(actual, expected)
	case "ends_with":
		matched = strings.HasSuffix(actual, expected)
	case "gt", ">":
		matched = actual > expected
	case "lt", "<":
		matched = actual < expected
	case "empty":
		matched = actual == ""
	case "not_empty":
		matched = actual != ""
	case "in":
		// value is comma-separated list
		for _, v := range strings.Split(expected, ",") {
			if strings.TrimSpace(v) == actual {
				matched = true
				break
			}
		}
	case "regex":
		// Simple regex match
		// For safety, we use strings-based matching for now
		matched = strings.Contains(actual, expected)
	default:
		return Result{Error: fmt.Sprintf("condition.match: unknown operator %q", op), OK: false}
	}

	// Convert config to JSON for debugging
	details, _ := json.Marshal(map[string]any{
		"field":    field,
		"op":       op,
		"expected": expected,
		"actual":   actual,
		"matched":  matched,
	})

	if !matched {
		return Result{
			Error:  fmt.Sprintf("condition not met: %s", string(details)),
			OK:     false,
			Output: map[string]any{"matched": false, "actual": actual},
		}
	}

	return Result{
		Output: map[string]any{"matched": true, "actual": actual},
		OK:     true,
	}
}
