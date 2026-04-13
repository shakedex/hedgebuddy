package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"

	"github.com/shakedex/hedgebuddy/service/internal/actions"
	"github.com/shakedex/hedgebuddy/service/internal/runner"
)

// --- Quill Settings ---

func (s *Server) handleGetQuillSettings(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, "quill id is required", http.StatusBadRequest)
		return
	}

	settings, err := s.store.GetQuillSettings(id)
	if err != nil {
		jsonError(w, "failed to get settings", http.StatusInternalServerError)
		return
	}

	jsonOK(w, settings)
}

func (s *Server) handleSetQuillSettings(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, "quill id is required", http.StatusBadRequest)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
	var settings map[string]string
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := s.store.SetQuillSettings(id, settings); err != nil {
		jsonError(w, "failed to save settings", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]string{"status": "saved"})
}

// --- Test Connection ---

func (s *Server) handleTestConnection(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, "quill id is required", http.StatusBadRequest)
		return
	}

	quillDef, ok := s.quills.Get(id)
	if !ok {
		jsonError(w, "quill not found", http.StatusNotFound)
		return
	}

	settings, err := s.store.GetQuillSettings(id)
	if err != nil {
		jsonError(w, "failed to load settings", http.StatusInternalServerError)
		return
	}

	ctx := &actions.Context{
		Settings: settings,
		Event:    make(map[string]any),
		Inputs:   make(map[string]string),
		Steps:    make(map[string]any),
	}

	// YAML-defined test_connection: execute the specified action.
	if quillDef.TestConnection != nil {
		tc := quillDef.TestConnection
		result, err := s.engine.ExecuteAction(tc.Action, tc.Config, ctx)
		if err != nil {
			jsonError(w, fmt.Sprintf("test connection action error: %v", err), http.StatusInternalServerError)
			return
		}

		// Check expected status if configured.
		if tc.ExpectStatus > 0 {
			if output, ok := result.Output.(map[string]any); ok {
				if status, ok := output["status"].(int); ok && status != tc.ExpectStatus {
					jsonOK(w, map[string]any{"ok": false, "error": fmt.Sprintf("unexpected status %d (expected %d)", status, tc.ExpectStatus)})
					return
				}
			}
		}

		jsonOK(w, map[string]any{"ok": result.OK, "error": result.Error})
		return
	}

	// Python quill fallback: dispatch test_connection command.
	if quillDef.Implementation == "python" && quillDef.Dir != "" {
		entry := quillDef.Entry
		if entry == "" {
			entry = "main.py"
		}

		pyInput := runner.PythonInput{
			Command:  "test_connection",
			Settings: settings,
		}

		output, err := runner.RunCommand(quillDef.Dir, filepath.Join(quillDef.Dir, entry), pyInput)
		if err != nil {
			jsonOK(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}

		jsonOK(w, map[string]any{"ok": output.OK, "error": output.Error})
		return
	}

	jsonError(w, "quill does not support test_connection", http.StatusBadRequest)
}

// --- Load Options ---

type loadOptionsRequest struct {
	InputName string `json:"input_name"`
}

func (s *Server) handleLoadOptions(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, "quill id is required", http.StatusBadRequest)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
	var req loadOptionsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.InputName == "" {
		jsonError(w, "input_name is required", http.StatusBadRequest)
		return
	}

	quillDef, ok := s.quills.Get(id)
	if !ok {
		jsonError(w, "quill not found", http.StatusNotFound)
		return
	}

	settings, err := s.store.GetQuillSettings(id)
	if err != nil {
		jsonError(w, "failed to load settings", http.StatusInternalServerError)
		return
	}

	ctx := &actions.Context{
		Settings: settings,
		Event:    make(map[string]any),
		Inputs:   make(map[string]string),
		Steps:    make(map[string]any),
	}

	// YAML-defined options: execute the specified action and map results.
	if quillDef.Options != nil {
		optDef, exists := quillDef.Options[req.InputName]
		if !exists {
			jsonError(w, fmt.Sprintf("no options defined for input %q", req.InputName), http.StatusBadRequest)
			return
		}

		result, err := s.engine.ExecuteAction(optDef.Action, optDef.Config, ctx)
		if err != nil {
			jsonError(w, fmt.Sprintf("options action error: %v", err), http.StatusInternalServerError)
			return
		}

		if !result.OK {
			jsonError(w, fmt.Sprintf("options action failed: %s", result.Error), http.StatusBadGateway)
			return
		}

		options := extractOptions(result.Output, optDef.ItemsPath, optDef.ValueField, optDef.LabelField)
		jsonOK(w, options)
		return
	}

	// Python quill fallback: dispatch load_options command.
	if quillDef.Implementation == "python" && quillDef.Dir != "" {
		entry := quillDef.Entry
		if entry == "" {
			entry = "main.py"
		}

		pyInput := runner.PythonInput{
			Command:   "load_options",
			Settings:  settings,
			InputName: req.InputName,
		}

		output, err := runner.RunCommand(quillDef.Dir, filepath.Join(quillDef.Dir, entry), pyInput)
		if err != nil {
			jsonError(w, fmt.Sprintf("load_options failed: %v", err), http.StatusInternalServerError)
			return
		}

		if !output.OK {
			jsonError(w, fmt.Sprintf("load_options failed: %s", output.Error), http.StatusBadGateway)
			return
		}

		jsonOK(w, output.Output)
		return
	}

	jsonError(w, fmt.Sprintf("quill does not define options for input %q", req.InputName), http.StatusBadRequest)
}

// extractOptions navigates the action result to a list of items, then maps
// each item's value and label fields into a simple [{value, label}] slice.
func extractOptions(output any, itemsPath, valueField, labelField string) []map[string]string {
	// Navigate to the items array using the dot path.
	items := navigatePath(output, itemsPath)

	arr, ok := items.([]any)
	if !ok {
		log.Printf("[settings] extractOptions: items at %q is not an array (got %T)", itemsPath, items)
		return nil
	}

	options := make([]map[string]string, 0, len(arr))
	for _, item := range arr {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		val := fmt.Sprintf("%v", m[valueField])
		label := fmt.Sprintf("%v", m[labelField])
		options = append(options, map[string]string{
			"value": val,
			"label": label,
		})
	}
	return options
}

// navigatePath walks a nested structure using a dot-separated path.
func navigatePath(data any, path string) any {
	if path == "" {
		return data
	}
	current := data
	for _, seg := range splitPath(path) {
		if current == nil {
			return nil
		}
		switch v := current.(type) {
		case map[string]any:
			current = v[seg]
		default:
			return nil
		}
	}
	return current
}

// splitPath splits a dot-separated path, handling empty strings.
func splitPath(path string) []string {
	if path == "" {
		return nil
	}
	parts := make([]string, 0, 4)
	start := 0
	for i := 0; i < len(path); i++ {
		if path[i] == '.' {
			if i > start {
				parts = append(parts, path[start:i])
			}
			start = i + 1
		}
	}
	if start < len(path) {
		parts = append(parts, path[start:])
	}
	return parts
}
