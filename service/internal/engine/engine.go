package engine

import (
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/shakedex/hedgebuddy/service/internal/actions"
	"github.com/shakedex/hedgebuddy/service/internal/diskinv"
	"github.com/shakedex/hedgebuddy/service/internal/hbvars"
	"github.com/shakedex/hedgebuddy/service/internal/quills"
	"github.com/shakedex/hedgebuddy/service/internal/runner"
	"github.com/shakedex/hedgebuddy/service/internal/schema"
	"github.com/shakedex/hedgebuddy/service/internal/storage"
)

// Engine routes incoming events to matching workflows and executes quill chains.
type Engine struct {
	registry  *schema.Registry
	store     *storage.Store
	workflows *storage.WorkflowStore
	actions   *actions.Registry
	quills    *quills.Library

	diskMu     sync.RWMutex
	knownDisks map[string]bool // drives present at service startup

	engagedMu sync.RWMutex
	engaged   bool // when false, events are stored but workflows are not executed
}

// New creates a new engine.
func New(reg *schema.Registry, store *storage.Store, wf *storage.WorkflowStore, ar *actions.Registry, lib *quills.Library) *Engine {
	snap := diskinv.Snapshot()
	log.Printf("[engine] Disk inventory: %d volume(s) at startup", len(snap))
	for d := range snap {
		log.Printf("[engine]   %s", d)
	}
	return &Engine{
		registry:   reg,
		store:      store,
		workflows:  wf,
		actions:    ar,
		quills:     lib,
		knownDisks: snap,
		engaged:    true,
	}
}

// Engaged returns whether the engine is actively executing workflows.
func (e *Engine) Engaged() bool {
	e.engagedMu.RLock()
	defer e.engagedMu.RUnlock()
	return e.engaged
}

// SetEngaged toggles the execution mode. When disengaged, events are still
// stored but no workflows are triggered (maintenance / dry-run mode).
func (e *Engine) SetEngaged(on bool) {
	e.engagedMu.Lock()
	e.engaged = on
	e.engagedMu.Unlock()
	if on {
		log.Println("[engine] Quills ENGAGED — workflows will execute")
	} else {
		log.Println("[engine] Quills DISENGAGED — maintenance mode, events stored only")
	}
}

// IncomingEvent is the envelope from inject.py (or per-event scripts).
type IncomingEvent struct {
	Payload    map[string]any `json:"payload"`
	ReceivedAt string         `json:"received_at"`
	App        string         `json:"app,omitempty"`   // explicit app id from per-event scripts
	Event      string         `json:"event,omitempty"` // explicit event name from per-event scripts
}

// ProcessEvent handles a new event: detect type, store, match workflows, execute chains.
func (e *Engine) ProcessEvent(evt IncomingEvent) error {
	var appID, eventName string

	// Per-event scripts provide explicit app/event identity.
	// Fall back to payload-based detection for the legacy universal inject.py.
	if evt.App != "" && evt.Event != "" {
		appID = evt.App
		eventName = evt.Event
	} else {
		var detected bool
		appID, eventName, detected = e.registry.DetectEvent(evt.Payload)
		if !detected {
			appID = "unknown"
			eventName = "unknown"
		}
	}

	// --- DiskAdded / DiskRemoved tracking ---
	if appID == "offshoot" {
		switch eventName {
		case "DiskAdded":
			// DiskAdded uses deviceName (Windows: "F:\") or rootFilePath (macOS: "/Volumes/X").
			deviceName, _ := evt.Payload["DiskAdded_deviceName"].(string)
			if deviceName == "" {
				deviceName, _ = evt.Payload["DiskAdded_rootFilePath"].(string)
			}
			norm := strings.ToUpper(strings.TrimSpace(deviceName))
			if norm != "" {
				e.diskMu.RLock()
				preExisting := e.knownDisks[norm]
				e.diskMu.RUnlock()
				if preExisting {
					log.Printf("[engine] DiskAdded suppressed: %s (pre-existing)", norm)
					return nil
				}
				// Genuine hot-plug — remember it.
				e.diskMu.Lock()
				e.knownDisks[norm] = true
				e.diskMu.Unlock()
			}
		case "DiskRemoved":
			// DiskRemoved uses rootFilePath (Windows: "F:\", macOS: "/Volumes/X").
			deviceName, _ := evt.Payload["DiskRemoved_rootFilePath"].(string)
			if deviceName == "" {
				deviceName, _ = evt.Payload["DiskRemoved_deviceName"].(string)
			}
			norm := strings.ToUpper(strings.TrimSpace(deviceName))
			if norm != "" {
				e.diskMu.Lock()
				delete(e.knownDisks, norm)
				e.diskMu.Unlock()
				log.Printf("[engine] Disk removed from inventory: %s", norm)
			}
		}
	}

	// Store the event.
	payloadJSON, err := json.Marshal(evt.Payload)
	if err != nil {
		return fmt.Errorf("marshaling payload: %w", err)
	}

	receivedAt := time.Now().UTC()
	if evt.ReceivedAt != "" {
		if parsed, err := time.Parse(time.RFC3339, evt.ReceivedAt); err == nil {
			receivedAt = parsed
		}
	}

	eventID, err := e.store.InsertEvent(appID, eventName, payloadJSON, receivedAt)
	if err != nil {
		return fmt.Errorf("storing event: %w", err)
	}

	log.Printf("[engine] Event #%d: app=%s event=%s", eventID, appID, eventName)

	// If disengaged (maintenance mode), store the event but skip workflow execution.
	if !e.Engaged() {
		log.Printf("[engine] Disengaged — skipping workflow matching for event #%d", eventID)
		return nil
	}

	// Find matching workflows.
	matches := e.workflows.MatchingWorkflows(appID, eventName, evt.Payload)
	if len(matches) == 0 {
		log.Printf("[engine] No matching workflows for %s/%s", appID, eventName)
		return nil
	}

	log.Printf("[engine] %d workflow(s) matched", len(matches))

	// Execute each matching workflow asynchronously.
	for _, wf := range matches {
		go e.executeWorkflow(wf, evt.Payload, appID, eventName)
	}

	return nil
}

// RunWorkflow manually executes a workflow with the given payload.
// This is used for testing/manual triggering from the UI.
func (e *Engine) RunWorkflow(wf storage.Workflow, payload map[string]any) error {
	appID := wf.Trigger.AppID
	eventName := wf.Trigger.EventType
	e.executeWorkflow(wf, payload, appID, eventName)
	return nil
}

func (e *Engine) executeWorkflow(wf storage.Workflow, payload map[string]any, appID, eventName string) {
	startedAt := time.Now().UTC().Format(time.RFC3339)
	runID, runErr := e.store.InsertRun(wf.ID, wf.Name, "running", startedAt)
	if runErr != nil {
		log.Printf("[engine] Failed to create run record: %v", runErr)
	}

	type stepLog struct {
		Step   int               `json:"step"`
		Quill  string            `json:"quill"`
		Status string            `json:"status"`
		Error  string            `json:"error,omitempty"`
		Inputs map[string]string `json:"inputs,omitempty"`
		Output any               `json:"output,omitempty"`
	}
	var stepsLog []stepLog

	finishRun := func(status, errMsg string) {
		if runID == 0 {
			return
		}
		finishedAt := time.Now().UTC().Format(time.RFC3339)
		logJSON, _ := json.Marshal(stepsLog)
		if err := e.store.FinishRun(runID, status, errMsg, finishedAt, string(logJSON)); err != nil {
			log.Printf("[engine] Failed to update run record: %v", err)
		}
	}

	defer func() {
		if r := recover(); r != nil {
			errMsg := fmt.Sprintf("panic: %v", r)
			log.Printf("[engine] Panic in workflow %q: %s", wf.Name, errMsg)
			finishRun("error", errMsg)
		}
	}()
	log.Printf("[engine] Executing workflow %q (%s)", wf.Name, wf.ID)

	ctx := &actions.Context{
		Event:     payload,
		Inputs:    make(map[string]string),
		Settings:  make(map[string]string),
		HBVars:    make(map[string]string),
		Steps:     make(map[string]any),
		AppID:     appID,
		EventName: eventName,
	}

	if values, err := hbvars.LoadValues(); err == nil {
		ctx.HBVars = values
	} else {
		log.Printf("[engine] Warning: failed to load HedgeBuddy vars: %v", err)
	}

	for i, step := range wf.Steps {
		ctx.StepIndex = i

		// Resolve step inputs into context.
		for _, input := range step.Inputs {
			ctx.Inputs[input.Name] = input.Value
		}

		// Load persistent quill settings for this step's quill.
		if settings, err := e.store.GetQuillSettings(step.QuillID); err == nil {
			ctx.Settings = settings
			ctx.Settings = resolveStringMap(ctx.Settings, ctx)
		} else {
			log.Printf("[engine] Warning: failed to load settings for quill %q: %v", step.QuillID, err)
			ctx.Settings = make(map[string]string)
		}

		// Look up the quill definition, then resolve its steps.
		if quillDef, ok := e.quills.Get(step.QuillID); ok {
			// Apply defaults from quill inputs for any missing workflow inputs.
			for _, qInput := range quillDef.InputsForMode(step.Mode) {
				if _, exists := ctx.Inputs[qInput.Name]; !exists && qInput.Default != "" {
					ctx.Inputs[qInput.Name] = qInput.Default
				}
			}

			// Snapshot resolved inputs for logging and Python execution.
			resolvedInputs := make(map[string]string, len(ctx.Inputs))
			for k, v := range ctx.Inputs {
				resolvedInputs[k] = resolveTemplates(v, ctx)
			}

			// Python quills: run via subprocess.
			if quillDef.Implementation == "python" {
				entry := quillDef.Entry
				if entry == "" {
					entry = "main.py"
				}
				dir := quillDef.Dir
				if dir == "" {
					errMsg := fmt.Sprintf("step %d: python quill %q has no directory", i, step.QuillID)
					log.Printf("[engine] %s", errMsg)
					stepsLog = append(stepsLog, stepLog{Step: i, Quill: step.QuillID, Status: "error", Error: errMsg, Inputs: resolvedInputs})
					finishRun("error", errMsg)
					return
				}

				pyInput := runner.PythonInput{
					Command:   "execute",
					Settings:  ctx.Settings,
					Inputs:    resolvedInputs,
					HBVars:    ctx.HBVars,
					Event:     ctx.Event,
					AppID:     ctx.AppID,
					EventName: ctx.EventName,
				}

				output, err := runner.RunPython(dir, filepath.Join(dir, entry), pyInput)
				if err != nil {
					errMsg := fmt.Sprintf("step %d (%s) python error: %v", i, step.QuillID, err)
					log.Printf("[engine] %s", errMsg)
					stepsLog = append(stepsLog, stepLog{Step: i, Quill: step.QuillID, Status: "error", Error: errMsg, Inputs: resolvedInputs})
					finishRun("error", errMsg)
					return
				}
				if !output.OK {
					errMsg := fmt.Sprintf("step %d (%s) python failed: %s", i, step.QuillID, output.Error)
					log.Printf("[engine] %s", errMsg)
					stepsLog = append(stepsLog, stepLog{Step: i, Quill: step.QuillID, Status: "error", Error: errMsg, Inputs: resolvedInputs})
					finishRun("error", errMsg)
					return
				}

				stepKey := fmt.Sprintf("step_%d", i)
				if step.OutputAlias != "" {
					stepKey = step.OutputAlias
				}
				ctx.Steps[stepKey] = output.Output
				stepsLog = append(stepsLog, stepLog{Step: i, Quill: step.QuillID, Status: "success", Inputs: resolvedInputs, Output: output.Output})
				log.Printf("[engine] Step %d (%s) python succeeded", i, step.QuillID)
			} else {
				// YAML built-in quills: execute action chain.
				quillSteps := quillDef.StepsForMode(step.Mode)
				failedAction := false
				for j, qs := range quillSteps {
					actionName := resolveTemplates(qs.Action, ctx)
					action, err := e.actions.Get(actionName)
					if err != nil {
						errMsg := fmt.Sprintf("step %d.%d: %v", i, j, err)
						log.Printf("[engine] %s", errMsg)
						stepsLog = append(stepsLog, stepLog{Step: i, Quill: step.QuillID, Status: "error", Error: errMsg, Inputs: resolvedInputs})
						finishRun("error", errMsg)
						return
					}
					config := resolveConfigTemplates(qs.Config, ctx)
					result := action.Execute(config, ctx)
					if !result.OK {
						errMsg := fmt.Sprintf("step %d.%d (%s) failed: %s", i, j, actionName, result.Error)
						log.Printf("[engine] %s", errMsg)
						stepsLog = append(stepsLog, stepLog{Step: i, Quill: step.QuillID, Status: "error", Error: errMsg, Inputs: resolvedInputs})
						finishRun("error", errMsg)
						failedAction = true
						break
					}
					outputKey := qs.Output
					if outputKey == "" && step.OutputAlias != "" {
						outputKey = step.OutputAlias
					}
					if outputKey != "" {
						ctx.Steps[outputKey] = result.Output
						// Also store under OutputAlias if it differs, so both
						// the YAML-defined name and the user alias resolve.
						if step.OutputAlias != "" && step.OutputAlias != outputKey {
							ctx.Steps[step.OutputAlias] = result.Output
						}
					}
					log.Printf("[engine] Step %d.%d (%s) succeeded", i, j, actionName)
				}
				if failedAction {
					return
				}
				// Collect output from all sub-steps for logging.
				var lastOutput any
				for _, qs := range quillSteps {
					if qs.Output != "" {
						lastOutput = ctx.Steps[qs.Output]
					}
				}
				stepsLog = append(stepsLog, stepLog{Step: i, Quill: step.QuillID, Status: "success", Inputs: resolvedInputs, Output: lastOutput})
			}
		} else {
			// Snapshot resolved inputs for logging and direct action execution.
			resolvedInputs := make(map[string]string, len(ctx.Inputs))
			for k, v := range ctx.Inputs {
				resolvedInputs[k] = resolveTemplates(v, ctx)
			}

			// Fallback: treat quill ID as a direct action name.
			action, err := e.actions.Get(step.QuillID)
			if err != nil {
				errMsg := fmt.Sprintf("step %d: unknown quill or action %q", i, step.QuillID)
				log.Printf("[engine] %s", errMsg)
				stepsLog = append(stepsLog, stepLog{Step: i, Quill: step.QuillID, Status: "error", Error: errMsg, Inputs: resolvedInputs})
				finishRun("error", errMsg)
				return
			}

			config := resolveConfigTemplates(inputsToConfig(ctx.Inputs), ctx)

			result := action.Execute(config, ctx)
			if !result.OK {
				errMsg := fmt.Sprintf("step %d (%s) failed: %s", i, step.QuillID, result.Error)
				log.Printf("[engine] %s", errMsg)
				stepsLog = append(stepsLog, stepLog{Step: i, Quill: step.QuillID, Status: "error", Error: errMsg, Inputs: resolvedInputs})
				finishRun("error", errMsg)
				return
			}

			stepKey := fmt.Sprintf("step_%d", i)
			if step.OutputAlias != "" {
				stepKey = step.OutputAlias
			}
			ctx.Steps[stepKey] = result.Output
			stepsLog = append(stepsLog, stepLog{Step: i, Quill: step.QuillID, Status: "success", Inputs: resolvedInputs, Output: result.Output})
		}

		log.Printf("[engine] Workflow step %d (%s) completed", i, step.QuillID)
	}

	finishRun("success", "")
	log.Printf("[engine] Workflow %q completed successfully", wf.Name)
}

// resolveTemplates replaces {{event.X}}, {{inputs.X}}, {{settings.X}},
// {{hb.X}}, {{steps.X.Y.Z}}, and {{app_id}}/{{event_name}} placeholders in a string.
// It also supports the legacy hedgebuddy:VAR_NAME shorthand for whole-value references.
// Supports deep dot-path traversal for structured step outputs
// (e.g. {{steps.auth.body.token}}).
func resolveTemplates(s string, ctx *actions.Context) string {
	if resolved, ok := resolveHBPrefixedValue(s, ctx.HBVars); ok {
		return resolved
	}
	if !strings.Contains(s, "{{") {
		return s
	}

	result := s

	// Replace {{app_id}} and {{event_name}}.
	result = strings.ReplaceAll(result, "{{app_id}}", ctx.AppID)
	result = strings.ReplaceAll(result, "{{event_name}}", ctx.EventName)

	// Replace date/time templates.
	now := time.Now()
	result = strings.ReplaceAll(result, "{{date}}", now.Format("2006-01-02"))
	result = strings.ReplaceAll(result, "{{time}}", now.Format("15:04:05"))
	result = strings.ReplaceAll(result, "{{datetime}}", now.Format(time.RFC3339))
	result = strings.ReplaceAll(result, "{{timestamp}}", fmt.Sprintf("%d", now.Unix()))

	// Replace {{date:FORMAT}} with custom Go-style date formats.
	// Supported shortcuts: YYYY, YY, MM, DD, HH, mm, ss → Go reference time equivalents.
	for {
		start := strings.Index(result, "{{date:")
		if start < 0 {
			break
		}
		end := strings.Index(result[start:], "}}")
		if end < 0 {
			break
		}
		full := result[start : start+end+2]
		userFmt := result[start+7 : start+end] // between "{{date:" and "}}"
		goFmt := convertDateFormat(userFmt)
		result = strings.Replace(result, full, now.Format(goFmt), 1)
	}

	// Replace {{counter}} with the step index (1-based). Useful for naming.
	if strings.Contains(result, "{{counter}}") {
		result = strings.ReplaceAll(result, "{{counter}}", fmt.Sprintf("%d", ctx.StepIndex+1))
	}

	// Replace {{event_summary}} with a compact key=value summary of the payload.
	if strings.Contains(result, "{{event_summary}}") {
		result = strings.ReplaceAll(result, "{{event_summary}}", buildEventSummary(ctx.Event))
	}

	// Replace {{event.X}} with values from the event payload (deep path).
	result = resolvePathTemplates(result, "event", ctx.Event)

	// Replace {{inputs.X}} with resolved inputs.
	for key, val := range ctx.Inputs {
		result = strings.ReplaceAll(result, "{{inputs."+key+"}}", val)
	}

	// Replace {{settings.X}} with persistent quill settings.
	for key, val := range ctx.Settings {
		result = strings.ReplaceAll(result, "{{settings."+key+"}}", val)
	}

	// Replace {{hb.X}} with HedgeBuddy variables from the active profile.
	for key, val := range ctx.HBVars {
		result = strings.ReplaceAll(result, "{{hb."+key+"}}", val)
	}

	// Replace {{steps.X}} and {{steps.X.Y.Z}} with deep path resolution.
	result = resolvePathTemplates(result, "steps", ctx.Steps)

	// Handle nested patterns like {{event.{{inputs.SOURCE_FIELD}}}}.
	// After the first pass, the inner template is resolved, e.g.:
	//   "{{event.{{inputs.SOURCE_FIELD}}}}" → "{{event.destinationPath}}"
	// A second pass resolves the outer reference — but only if something changed.
	if strings.Contains(result, "{{") && result != s {
		result = resolveTemplates(result, ctx)
	}

	return result
}

func resolveHBPrefixedValue(s string, hb map[string]string) (string, bool) {
	if !strings.HasPrefix(s, "hedgebuddy:") {
		return "", false
	}
	key := strings.TrimSpace(strings.TrimPrefix(s, "hedgebuddy:"))
	if key == "" {
		return s, true
	}
	if val, ok := hb[key]; ok {
		return val, true
	}
	return s, true
}

// resolvePathTemplates finds all {{prefix.path.to.field}} placeholders and
// resolves them by walking the given data using dot-separated path segments.
// Supports nested maps, arrays (numeric indices), and stringified JSON.
func resolvePathTemplates(s, prefix string, data map[string]any) string {
	search := "{{" + prefix + "."
	for {
		start := strings.Index(s, search)
		if start < 0 {
			return s
		}
		end := strings.Index(s[start:], "}}")
		if end < 0 {
			return s
		}
		full := s[start : start+end+2]
		path := s[start+len(search) : start+end] // e.g. "auth.body.token"
		val := walkPath(data, path)
		s = strings.Replace(s, full, stringifyValue(val), 1)
	}
}

// stringifyValue converts a resolved template value to a string suitable for
// injection into a template. Single-element arrays are unwrapped; multi-element
// arrays and objects are JSON-encoded; everything else uses fmt.Sprintf.
func stringifyValue(val any) string {
	switch v := val.(type) {
	case nil:
		return ""
	case string:
		return v
	case []any:
		if len(v) == 1 {
			return stringifyValue(v[0])
		}
		b, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		return string(b)
	case map[string]any:
		b, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		return string(b)
	default:
		return fmt.Sprintf("%v", v)
	}
}

// walkPath traverses a nested map/slice structure using a dot-separated path.
// Supports string keys for maps and numeric indices for slices.
func walkPath(data any, path string) any {
	segments := strings.Split(path, ".")
	current := data
	for _, seg := range segments {
		if current == nil {
			return ""
		}
		switch v := current.(type) {
		case map[string]any:
			current = v[seg]
		case map[string]string:
			return v[seg]
		case []any:
			idx := 0
			if _, err := fmt.Sscanf(seg, "%d", &idx); err != nil || idx < 0 || idx >= len(v) {
				return ""
			}
			current = v[idx]
		default:
			// If the current value is a string that looks like JSON, try parsing it.
			if str, ok := current.(string); ok && len(str) > 0 && (str[0] == '{' || str[0] == '[') {
				var parsed any
				if json.Unmarshal([]byte(str), &parsed) == nil {
					current = parsed
					// Re-walk from this segment since we just parsed.
					remaining := strings.Join(append([]string{seg}, segments[1:]...), ".")
					_ = remaining
					// Actually, let's walk one more level on the parsed value.
					if m, ok := parsed.(map[string]any); ok {
						current = m[seg]
					} else {
						return ""
					}
				} else {
					return ""
				}
			} else {
				return fmt.Sprintf("%v", current)
			}
		}
	}
	if current == nil {
		return ""
	}
	return current
}

// resolveConfigTemplates resolves template strings in all config values.
func resolveConfigTemplates(config map[string]any, ctx *actions.Context) map[string]any {
	resolved := make(map[string]any, len(config))
	for k, v := range config {
		resolved[k] = resolveConfigValue(v, ctx)
	}
	return resolved
}

func resolveConfigValue(v any, ctx *actions.Context) any {
	switch val := v.(type) {
	case string:
		return resolveTemplates(val, ctx)
	case map[string]any:
		return resolveConfigTemplates(val, ctx)
	case []any:
		out := make([]any, len(val))
		for i, item := range val {
			out[i] = resolveConfigValue(item, ctx)
		}
		return out
	default:
		return v
	}
}

func resolveStringMap(values map[string]string, ctx *actions.Context) map[string]string {
	if len(values) == 0 {
		return make(map[string]string)
	}
	resolved := make(map[string]string, len(values))
	for key, val := range values {
		resolved[key] = resolveTemplates(val, ctx)
	}
	return resolved
}

func inputsToConfig(inputs map[string]string) map[string]any {
	config := make(map[string]any, len(inputs))
	for k, v := range inputs {
		config[k] = v
	}
	return config
}

// buildEventSummary produces a compact "key=value, key=value" string from the
// event payload, stripping the event-name prefix from keys for readability.
func buildEventSummary(event map[string]any) string {
	if len(event) == 0 {
		return "(empty)"
	}

	// Detect the common prefix (e.g. "FileCopyCompleted_").
	var prefix string
	for key := range event {
		if idx := strings.Index(key, "_"); idx > 0 {
			candidate := key[:idx+1]
			if prefix == "" {
				prefix = candidate
			} else if prefix != candidate {
				prefix = "" // mixed prefixes — don't strip
				break
			}
		}
	}

	parts := make([]string, 0, len(event))
	for key, val := range event {
		display := key
		if prefix != "" {
			display = strings.TrimPrefix(key, prefix)
		}
		s := stringifyValue(val)
		if len(s) > 120 {
			s = s[:117] + "..."
		}
		parts = append(parts, display+"="+s)
	}
	return strings.Join(parts, ", ")
}

// ActionsMeta returns metadata for all registered actions (used by the API).
func (e *Engine) ActionsMeta() []actions.ActionMeta {
	return e.actions.AllMeta()
}

// ExecuteAction runs a single action by name with the given config and context.
// Used by the settings API for test_connection and load_options.
func (e *Engine) ExecuteAction(actionName string, config map[string]any, ctx *actions.Context) (actions.Result, error) {
	action, err := e.actions.Get(actionName)
	if err != nil {
		return actions.Result{}, err
	}
	resolved := resolveConfigTemplates(config, ctx)
	return action.Execute(resolved, ctx), nil
}

// ResolveTemplateString resolves template placeholders in a string using the given context.
func (e *Engine) ResolveTemplateString(s string, ctx *actions.Context) string {
	return resolveTemplates(s, ctx)
}

// convertDateFormat translates a user-friendly date format string to Go's reference-time layout.
// Supported tokens: YYYY, YY, MM, DD, HH, mm, ss
func convertDateFormat(userFmt string) string {
	r := strings.NewReplacer(
		"YYYY", "2006",
		"YY", "06",
		"MM", "01",
		"DD", "02",
		"HH", "15",
		"mm", "04",
		"ss", "05",
	)
	return r.Replace(userFmt)
}
