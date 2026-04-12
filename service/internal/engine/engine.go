package engine

import (
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"time"

	"github.com/shakedex/hedgebuddy/service/internal/actions"
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
}

// New creates a new engine.
func New(reg *schema.Registry, store *storage.Store, wf *storage.WorkflowStore, ar *actions.Registry, lib *quills.Library) *Engine {
	return &Engine{
		registry:  reg,
		store:     store,
		workflows: wf,
		actions:   ar,
		quills:    lib,
	}
}

// IncomingEvent is the envelope from inject.py.
type IncomingEvent struct {
	Payload    map[string]any `json:"payload"`
	ReceivedAt string         `json:"received_at"`
}

// ProcessEvent handles a new event: detect type, store, match workflows, execute chains.
func (e *Engine) ProcessEvent(evt IncomingEvent) error {
	appID, eventName, detected := e.registry.DetectEvent(evt.Payload)
	if !detected {
		appID = "unknown"
		eventName = "unknown"
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
		Steps:     make(map[string]any),
		AppID:     appID,
		EventName: eventName,
	}

	for i, step := range wf.Steps {
		ctx.StepIndex = i

		// Resolve step inputs into context.
		for _, input := range step.Inputs {
			ctx.Inputs[input.Name] = input.Value
		}

		// Snapshot resolved inputs for logging.
		resolvedInputs := make(map[string]string, len(ctx.Inputs))
		for k, v := range ctx.Inputs {
			resolvedInputs[k] = resolveTemplates(v, ctx)
		}

		// Look up the quill definition, then resolve its steps.
		if quillDef, ok := e.quills.Get(step.QuillID); ok {
			// Apply defaults from quill inputs for any missing workflow inputs.
			for _, qInput := range quillDef.InputsForMode(step.Mode) {
				if _, exists := ctx.Inputs[qInput.Name]; !exists && qInput.Default != "" {
					ctx.Inputs[qInput.Name] = qInput.Default
				}
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
					Event:     ctx.Event,
					Inputs:    ctx.Inputs,
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
					if qs.Output != "" {
						ctx.Steps[qs.Output] = result.Output
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
			ctx.Steps[stepKey] = result.Output
			stepsLog = append(stepsLog, stepLog{Step: i, Quill: step.QuillID, Status: "success", Inputs: resolvedInputs, Output: result.Output})
		}

		log.Printf("[engine] Workflow step %d (%s) completed", i, step.QuillID)
	}

	finishRun("success", "")
	log.Printf("[engine] Workflow %q completed successfully", wf.Name)
}

// resolveTemplates replaces {{event.X}}, {{inputs.X}}, {{steps.X}}, and
// {{app_id}}/{{event_name}} placeholders in a string.
func resolveTemplates(s string, ctx *actions.Context) string {
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

	// Replace {{event.X}} with values from the event payload.
	for key, val := range ctx.Event {
		result = strings.ReplaceAll(result, "{{event."+key+"}}", fmt.Sprintf("%v", val))
	}

	// Replace {{inputs.X}} with resolved inputs.
	for key, val := range ctx.Inputs {
		result = strings.ReplaceAll(result, "{{inputs."+key+"}}", val)
	}

	// Replace {{steps.X}} with outputs from previous steps.
	for key, val := range ctx.Steps {
		result = strings.ReplaceAll(result, "{{steps."+key+"}}", fmt.Sprintf("%v", val))
	}

	// Handle nested patterns like {{event.{{inputs.SOURCE_FIELD}}}}.
	// After the first pass, the inner template is resolved, e.g.:
	//   "{{event.{{inputs.SOURCE_FIELD}}}}" → "{{event.destinationPath}}"
	// A second pass resolves the outer reference — but only if something changed.
	if strings.Contains(result, "{{") && result != s {
		result = resolveTemplates(result, ctx)
	}

	return result
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
		s := fmt.Sprintf("%v", val)
		if len(s) > 60 {
			s = s[:57] + "..."
		}
		parts = append(parts, display+"="+s)
	}
	return strings.Join(parts, ", ")
}

// ActionsMeta returns metadata for all registered actions (used by the API).
func (e *Engine) ActionsMeta() []actions.ActionMeta {
	return e.actions.AllMeta()
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
