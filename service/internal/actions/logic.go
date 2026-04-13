package actions

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// LogWriteAction writes a message to the Quills event log.
type LogWriteAction struct{}

func (a *LogWriteAction) Name() string { return "log.write" }

func (a *LogWriteAction) Execute(config map[string]any, ctx *Context) Result {
	message, _ := config["message"].(string)
	if message == "" {
		return Result{Error: "log.write: message is required", OK: false}
	}

	logLine := fmt.Sprintf("[%s] %s\n", time.Now().UTC().Format(time.RFC3339), message)

	// If a path is specified, write to that file. Otherwise write to stdout.
	if path, ok := config["path"].(string); ok && path != "" {
		f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err != nil {
			return Result{Error: fmt.Sprintf("log.write: %v", err), OK: false}
		}
		defer f.Close()
		if _, err := f.WriteString(logLine); err != nil {
			return Result{Error: fmt.Sprintf("log.write: %v", err), OK: false}
		}
	}

	return Result{Output: map[string]any{"message": message}, OK: true}
}

// TemplateRenderAction renders a Mustache-style template string.
type TemplateRenderAction struct{}

func (a *TemplateRenderAction) Name() string { return "template.render" }

func (a *TemplateRenderAction) Execute(config map[string]any, ctx *Context) Result {
	template, _ := config["template"].(string)
	if template == "" {
		return Result{Error: "template.render: template is required", OK: false}
	}

	rendered := renderTemplate(template, ctx)
	return Result{Output: rendered, OK: true}
}

// renderTemplate replaces {{event.field}}, {{inputs.name}}, {{settings.name}},
// {{steps.name}} placeholders.
func renderTemplate(tmpl string, ctx *Context) string {
	result := tmpl

	// Replace {{event.X}} with values from the event payload.
	for key, val := range ctx.Event {
		placeholder := "{{event." + key + "}}"
		result = strings.ReplaceAll(result, placeholder, fmt.Sprintf("%v", val))
	}

	// Replace {{inputs.X}} with resolved inputs.
	for key, val := range ctx.Inputs {
		placeholder := "{{inputs." + key + "}}"
		result = strings.ReplaceAll(result, placeholder, val)
	}

	// Replace {{settings.X}} with persistent quill settings.
	for key, val := range ctx.Settings {
		placeholder := "{{settings." + key + "}}"
		result = strings.ReplaceAll(result, placeholder, val)
	}

	// Replace {{steps.X}} with outputs from previous steps.
	for key, val := range ctx.Steps {
		placeholder := "{{steps." + key + "}}"
		result = strings.ReplaceAll(result, placeholder, fmt.Sprintf("%v", val))
	}

	return result
}
