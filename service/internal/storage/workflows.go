package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Condition is a single field match rule for a workflow trigger.
type Condition struct {
	Field string `json:"field"`
	Op    string `json:"op"` // "eq", "neq", "contains", "regex"
	Value string `json:"value"`
}

// Trigger defines when a workflow fires.
type Trigger struct {
	EventType  string      `json:"event_type"`
	AppID      string      `json:"app_id,omitempty"`
	Conditions []Condition `json:"conditions,omitempty"`
}

// StepInput is a key-value pair for a quill step's configuration.
// Values may include HedgeBuddy references such as {{hb.VAR_NAME}} templates
// or the legacy hedgebuddy:VAR_NAME prefix, both resolved at runtime.
type StepInput struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// Step is a single action in a workflow chain.
type Step struct {
	QuillID     string      `json:"quill_id"`
	Mode        string      `json:"mode,omitempty"`
	Inputs      []StepInput `json:"inputs"`
	OutputAlias string      `json:"output_alias,omitempty"`
}

// Workflow is a user-defined event → action chain.
type Workflow struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Enabled   bool      `json:"enabled"`
	Trigger   Trigger   `json:"trigger"`
	Steps     []Step    `json:"steps"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// WorkflowStore manages workflow persistence via a JSON file.
type WorkflowStore struct {
	mu   sync.RWMutex
	path string
	data workflowFile
}

type workflowFile struct {
	Workflows []Workflow `json:"workflows"`
}

// NewWorkflowStore creates or loads the workflow store.
func NewWorkflowStore(baseDir string) (*WorkflowStore, error) {
	path := filepath.Join(baseDir, "workflows.json")
	ws := &WorkflowStore{path: path}

	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			ws.data = workflowFile{Workflows: []Workflow{}}
			return ws, nil
		}
		return nil, fmt.Errorf("reading workflows: %w", err)
	}

	if err := json.Unmarshal(raw, &ws.data); err != nil {
		return nil, fmt.Errorf("parsing workflows: %w", err)
	}

	return ws, nil
}

func (ws *WorkflowStore) save() error {
	raw, err := json.MarshalIndent(ws.data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ws.path, raw, 0o644)
}

// List returns all workflows.
func (ws *WorkflowStore) List() []Workflow {
	ws.mu.RLock()
	defer ws.mu.RUnlock()
	out := make([]Workflow, len(ws.data.Workflows))
	copy(out, ws.data.Workflows)
	return out
}

// Get returns a workflow by ID.
func (ws *WorkflowStore) Get(id string) (Workflow, bool) {
	ws.mu.RLock()
	defer ws.mu.RUnlock()
	for _, w := range ws.data.Workflows {
		if w.ID == id {
			return w, true
		}
	}
	return Workflow{}, false
}

// Create adds a new workflow.
func (ws *WorkflowStore) Create(w Workflow) (Workflow, error) {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	w.ID = uuid.New().String()
	now := time.Now().UTC()
	w.CreatedAt = now
	w.UpdatedAt = now

	ws.data.Workflows = append(ws.data.Workflows, w)
	if err := ws.save(); err != nil {
		return Workflow{}, err
	}
	return w, nil
}

// Update replaces a workflow by ID.
func (ws *WorkflowStore) Update(id string, w Workflow) (Workflow, error) {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	for i, existing := range ws.data.Workflows {
		if existing.ID == id {
			w.ID = id
			w.CreatedAt = existing.CreatedAt
			w.UpdatedAt = time.Now().UTC()
			ws.data.Workflows[i] = w
			if err := ws.save(); err != nil {
				return Workflow{}, err
			}
			return w, nil
		}
	}
	return Workflow{}, fmt.Errorf("workflow %s not found", id)
}

// Delete removes a workflow by ID.
func (ws *WorkflowStore) Delete(id string) error {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	for i, w := range ws.data.Workflows {
		if w.ID == id {
			ws.data.Workflows = append(ws.data.Workflows[:i], ws.data.Workflows[i+1:]...)
			return ws.save()
		}
	}
	return fmt.Errorf("workflow %s not found", id)
}

// MatchingWorkflows returns all enabled workflows whose trigger matches the given app and event.
func (ws *WorkflowStore) MatchingWorkflows(appID, eventName string, payload map[string]any) []Workflow {
	ws.mu.RLock()
	defer ws.mu.RUnlock()

	var matches []Workflow
	for _, w := range ws.data.Workflows {
		if !w.Enabled {
			continue
		}
		if w.Trigger.EventType != eventName && w.Trigger.EventType != "*" {
			continue
		}
		if w.Trigger.AppID != "" && w.Trigger.AppID != appID {
			continue
		}
		if !matchConditions(w.Trigger.Conditions, payload) {
			continue
		}
		matches = append(matches, w)
	}
	return matches
}

func matchConditions(conditions []Condition, payload map[string]any) bool {
	for _, cond := range conditions {
		val, ok := payload[cond.Field]

		// Handle empty/not_empty without requiring the field to exist.
		if cond.Op == "empty" {
			if ok && fmt.Sprintf("%v", val) != "" {
				return false
			}
			continue
		}
		if cond.Op == "not_empty" {
			if !ok || fmt.Sprintf("%v", val) == "" {
				return false
			}
			continue
		}

		if !ok {
			return false
		}
		strVal := fmt.Sprintf("%v", val)

		switch cond.Op {
		case "eq":
			if strVal != cond.Value {
				return false
			}
		case "neq":
			if strVal == cond.Value {
				return false
			}
		case "contains":
			if !strings.Contains(strVal, cond.Value) {
				return false
			}
		case "not_contains":
			if strings.Contains(strVal, cond.Value) {
				return false
			}
		case "starts_with":
			if !strings.HasPrefix(strVal, cond.Value) {
				return false
			}
		case "ends_with":
			if !strings.HasSuffix(strVal, cond.Value) {
				return false
			}
		case "gt":
			a, errA := strconv.ParseFloat(strVal, 64)
			b, errB := strconv.ParseFloat(cond.Value, 64)
			if errA != nil || errB != nil || a <= b {
				return false
			}
		case "lt":
			a, errA := strconv.ParseFloat(strVal, 64)
			b, errB := strconv.ParseFloat(cond.Value, 64)
			if errA != nil || errB != nil || a >= b {
				return false
			}
		case "in":
			values := strings.Split(cond.Value, ",")
			found := false
			for _, v := range values {
				if strings.TrimSpace(v) == strVal {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		case "regex":
			re, err := regexp.Compile(cond.Value)
			if err != nil || !re.MatchString(strVal) {
				return false
			}
		default:
			// Unknown op — skip
		}
	}
	return true
}
