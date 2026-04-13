package actions

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// JSONExtractAction extracts fields from a JSON source using dot-path notation.
type JSONExtractAction struct{}

func (a *JSONExtractAction) Name() string { return "json.extract" }

func (a *JSONExtractAction) Execute(config map[string]any, ctx *Context) Result {
	fields, ok := config["fields"].(map[string]any)
	if !ok || len(fields) == 0 {
		return Result{Error: "json.extract: fields map is required", OK: false}
	}

	// Resolve the source — can be a structured object already or a JSON string.
	source := config["source"]
	if s, ok := source.(string); ok {
		var parsed any
		if err := json.Unmarshal([]byte(s), &parsed); err != nil {
			return Result{Error: fmt.Sprintf("json.extract: parsing source: %v", err), OK: false}
		}
		source = parsed
	}

	output := make(map[string]any, len(fields))
	for outputName, pathVal := range fields {
		path, _ := pathVal.(string)
		if path == "" {
			continue
		}
		output[outputName] = jsonWalkPath(source, path)
	}

	return Result{Output: output, OK: true}
}

// jsonWalkPath traverses a nested structure using a dot-separated path.
func jsonWalkPath(data any, path string) any {
	segments := strings.Split(path, ".")
	current := data
	for _, seg := range segments {
		if current == nil {
			return nil
		}
		switch v := current.(type) {
		case map[string]any:
			current = v[seg]
		case []any:
			idx, err := strconv.Atoi(seg)
			if err != nil || idx < 0 || idx >= len(v) {
				return nil
			}
			current = v[idx]
		default:
			return nil
		}
	}
	return current
}
