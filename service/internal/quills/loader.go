package quills

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

//go:embed builtins/**/quill.yaml
var builtinsFS embed.FS

// Input describes a user-configurable parameter for a quill.
type Input struct {
	Name        string   `yaml:"name"        json:"name"`
	Type        string   `yaml:"type"        json:"type"`
	Required    bool     `yaml:"required"    json:"required"`
	Label       string   `yaml:"label"       json:"label"`
	Description string   `yaml:"description" json:"description"`
	Default     string   `yaml:"default"     json:"default,omitempty"`
	Values      []string `yaml:"values"      json:"values,omitempty"`
	ForModes    []string `yaml:"for_modes"   json:"for_modes,omitempty"`
}

// SettingDef describes a persistent quill-level configuration parameter.
// Settings are configured once in the Quills management page and shared
// across all workflows that use this quill.
type SettingDef struct {
	Name        string `yaml:"name"        json:"name"`
	Type        string `yaml:"type"        json:"type"` // string, url, secure, number, boolean, enum
	Required    bool   `yaml:"required"    json:"required"`
	Label       string `yaml:"label"       json:"label"`
	Description string `yaml:"description" json:"description"`
	Default     string `yaml:"default"     json:"default,omitempty"`
}

// OptionDef describes how to fetch dynamic options for an input at form time.
// The engine executes the specified action with saved settings and maps the
// response into value/label pairs for the UI dropdown.
type OptionDef struct {
	Action     string         `yaml:"action"      json:"action"`      // e.g. "http.get"
	Config     map[string]any `yaml:"config"      json:"config"`      // action config with {{settings.X}} templates
	ItemsPath  string         `yaml:"items_path"  json:"items_path"`  // dot path to array in response (e.g. "body.items")
	ValueField string         `yaml:"value_field" json:"value_field"` // field name for option value
	LabelField string         `yaml:"label_field" json:"label_field"` // field name for option label
}

// TestConnectionDef describes how to validate that saved settings are correct.
type TestConnectionDef struct {
	Action       string         `yaml:"action"        json:"action"`
	Config       map[string]any `yaml:"config"        json:"config"`
	ExpectStatus int            `yaml:"expect_status" json:"expect_status,omitempty"` // default: 200
}

// ActionStep is a single action invocation within a quill.
type ActionStep struct {
	Action  string         `yaml:"action"  json:"action"`
	Output  string         `yaml:"output"  json:"output,omitempty"`
	Config  map[string]any `yaml:"-"       json:"config"`
	RawStep map[string]any `yaml:",inline" json:"-"`
}

// Mode describes one operational mode of a multi-mode quill.
type Mode struct {
	Label       string       `yaml:"label"       json:"label"`
	Description string       `yaml:"description" json:"description,omitempty"`
	Steps       []ActionStep `yaml:"steps"       json:"steps"`
}

// Quill is a parsed quill definition loaded from a quill.yaml file.
type Quill struct {
	ID                 string          `yaml:"id"                  json:"id"`
	Name               string          `yaml:"name"                json:"name"`
	Version            string          `yaml:"version"             json:"version"`
	Description        string          `yaml:"description"         json:"description"`
	Author             string          `yaml:"author"              json:"author"`
	Category           string          `yaml:"category"            json:"category"`
	Icon               string          `yaml:"icon"                json:"icon,omitempty"`
	Inputs             []Input         `yaml:"inputs"              json:"inputs"`
	CompatibleTriggers []string        `yaml:"compatible_triggers" json:"compatible_triggers"`
	Modes              map[string]Mode `yaml:"modes"               json:"modes,omitempty"`
	Steps              []ActionStep    `yaml:"steps"               json:"steps"`

	// Dynamic quill support.
	Settings       []SettingDef         `yaml:"settings"        json:"settings,omitempty"`
	Options        map[string]OptionDef `yaml:"options"         json:"options,omitempty"`
	TestConnection *TestConnectionDef   `yaml:"test_connection" json:"test_connection,omitempty"`

	// Source indicates where this quill was loaded from.
	Source string `yaml:"-" json:"source,omitempty"` // "builtin" or "installed"

	// Python quill fields.
	Implementation string `yaml:"implementation" json:"implementation,omitempty"`
	Entry          string `yaml:"entry"          json:"entry,omitempty"`

	// Path to the quill's directory on disk (for installed quills).
	Dir string `yaml:"-" json:"-"`
}

// StepsForMode returns the action steps for a given mode.
// If the quill has no modes, or the mode is empty, returns the default Steps.
func (q *Quill) StepsForMode(mode string) []ActionStep {
	if mode != "" && q.Modes != nil {
		if m, ok := q.Modes[mode]; ok {
			return m.Steps
		}
	}
	return q.Steps
}

// InputsForMode returns inputs applicable to a given mode.
// Inputs with empty ForModes apply to all modes.
func (q *Quill) InputsForMode(mode string) []Input {
	if mode == "" || q.Modes == nil {
		return q.Inputs
	}
	var filtered []Input
	for _, inp := range q.Inputs {
		if len(inp.ForModes) == 0 {
			filtered = append(filtered, inp)
			continue
		}
		for _, m := range inp.ForModes {
			if m == mode {
				filtered = append(filtered, inp)
				break
			}
		}
	}
	return filtered
}

// Library holds all loaded quill definitions.
type Library struct {
	quills map[string]*Quill // keyed by quill ID
}

// NewLibrary creates a library and loads all embedded built-in quills.
func NewLibrary() (*Library, error) {
	lib := &Library{quills: make(map[string]*Quill)}

	err := fs.WalkDir(builtinsFS, "builtins", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || filepath.Base(path) != "quill.yaml" {
			return nil
		}

		data, err := builtinsFS.ReadFile(path)
		if err != nil {
			return fmt.Errorf("reading %s: %w", path, err)
		}

		q, err := parseQuill(data)
		if err != nil {
			return fmt.Errorf("parsing %s: %w", path, err)
		}

		if q.ID == "" {
			return fmt.Errorf("%s: quill id is required", path)
		}

		q.Source = "builtin"
		lib.quills[q.ID] = q
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("loading built-in quills: %w", err)
	}

	return lib, nil
}

// LoadInstalled loads quills from the installed directory on disk.
// Installed quills do not override built-in ones.
func (lib *Library) LoadInstalled(dir string) error {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return nil // no installed quills yet
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("reading installed quills dir: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		yamlPath := filepath.Join(dir, entry.Name(), "quill.yaml")
		data, err := os.ReadFile(yamlPath)
		if err != nil {
			if os.IsNotExist(err) {
				continue // skip folders without quill.yaml
			}
			return fmt.Errorf("reading %s: %w", yamlPath, err)
		}

		q, err := parseQuill(data)
		if err != nil {
			return fmt.Errorf("parsing %s: %w", yamlPath, err)
		}

		if q.ID == "" {
			continue
		}

		// Don't override built-in quills.
		if _, exists := lib.quills[q.ID]; exists {
			continue
		}

		q.Source = "installed"
		q.Dir = filepath.Join(dir, entry.Name())
		lib.quills[q.ID] = q
	}

	return nil
}

func parseQuill(data []byte) (*Quill, error) {
	var q Quill
	if err := yaml.Unmarshal(data, &q); err != nil {
		return nil, err
	}

	// Extract action config from raw step data (everything except "action" and "output").
	processSteps(q.Steps)
	for name, mode := range q.Modes {
		processSteps(mode.Steps)
		q.Modes[name] = mode
	}

	return &q, nil
}

func processSteps(steps []ActionStep) {
	for i := range steps {
		step := &steps[i]
		step.Config = make(map[string]any)
		for k, v := range step.RawStep {
			if k != "action" && k != "output" {
				step.Config[k] = v
			}
		}
	}
}

// Get returns a quill by ID.
func (lib *Library) Get(id string) (*Quill, bool) {
	q, ok := lib.quills[id]
	return q, ok
}

// List returns all loaded quills, sorted by category then name.
func (lib *Library) List() []*Quill {
	result := make([]*Quill, 0, len(lib.quills))
	for _, q := range lib.quills {
		result = append(result, q)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Category != result[j].Category {
			return result[i].Category < result[j].Category
		}
		return result[i].Name < result[j].Name
	})
	return result
}

// Validate checks a quill definition for common issues.
func Validate(q *Quill) []string {
	var issues []string

	if q.ID == "" {
		issues = append(issues, "id is required")
	}
	if q.Name == "" {
		issues = append(issues, "name is required")
	}
	if q.Version == "" {
		issues = append(issues, "version is required")
	}

	hasSteps := len(q.Steps) > 0
	for _, mode := range q.Modes {
		if len(mode.Steps) > 0 {
			hasSteps = true
			break
		}
	}
	if !hasSteps && q.Implementation == "" {
		issues = append(issues, "at least one step, mode, or implementation is required")
	}

	for i, input := range q.Inputs {
		if input.Name == "" {
			issues = append(issues, fmt.Sprintf("input %d: name is required", i))
		}
		validTypes := map[string]bool{
			"string": true, "url": true, "path": true,
			"number": true, "boolean": true, "enum": true, "secure": true,
			"dynamic": true,
		}
		if input.Type != "" && !validTypes[strings.ToLower(input.Type)] {
			issues = append(issues, fmt.Sprintf("input %d: unknown type %q", i, input.Type))
		}
	}

	return issues
}
