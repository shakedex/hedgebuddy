package schema

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed data/*.json
var schemaFS embed.FS

// FieldType represents the type of an event field.
type FieldType string

const (
	FieldTypeString    FieldType = "string"
	FieldTypeNumber    FieldType = "number"
	FieldTypeBoolean   FieldType = "boolean"
	FieldTypePath      FieldType = "path"
	FieldTypeTimestamp FieldType = "timestamp"
	FieldTypeEnum      FieldType = "enum"
	FieldTypeObject    FieldType = "object"
	FieldTypeArray     FieldType = "array"
)

// Field describes a single field in an event payload.
type Field struct {
	Type        FieldType         `json:"type"`
	Description string            `json:"description,omitempty"`
	Unit        string            `json:"unit,omitempty"`
	Format      string            `json:"format,omitempty"`
	Values      []string          `json:"values,omitempty"` // for enum type
	Fields      map[string]*Field `json:"fields,omitempty"` // for object type
	Items       *Field            `json:"items,omitempty"`  // for array type
}

// Event describes a single event type.
type Event struct {
	DisplayName string            `json:"display_name"`
	Description string            `json:"description"`
	Fields      map[string]*Field `json:"fields"`
}

// AppSchema describes all events and metadata for a single Hedge app.
type AppSchema struct {
	App         string            `json:"app"`
	DisplayName string            `json:"display_name"`
	URLScheme   string            `json:"url_scheme"`
	Events      map[string]*Event `json:"events"`
}

// Registry holds all loaded app schemas and provides lookup methods.
type Registry struct {
	Apps          map[string]*AppSchema // keyed by app id (e.g. "offshoot")
	prefixToEvent map[string]eventRef   // e.g. "FileCopyCompleted" -> {app: "offshoot", event: "FileCopyCompleted"}
}

type eventRef struct {
	App   string
	Event string
}

// Load reads all embedded schema JSON files and builds the registry.
func Load() (*Registry, error) {
	r := &Registry{
		Apps:          make(map[string]*AppSchema),
		prefixToEvent: make(map[string]eventRef),
	}

	entries, err := schemaFS.ReadDir("data")
	if err != nil {
		return nil, fmt.Errorf("reading embedded schemas: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		data, err := schemaFS.ReadFile("data/" + entry.Name())
		if err != nil {
			return nil, fmt.Errorf("reading schema %s: %w", entry.Name(), err)
		}

		var app AppSchema
		if err := json.Unmarshal(data, &app); err != nil {
			return nil, fmt.Errorf("parsing schema %s: %w", entry.Name(), err)
		}

		r.Apps[app.App] = &app

		for eventName := range app.Events {
			r.prefixToEvent[eventName] = eventRef{App: app.App, Event: eventName}
		}
	}

	return r, nil
}

// DetectEvent examines payload keys and returns the app ID , event name, and
// whether detection succeeded. It works by matching key prefixes like
// "FileCopyCompleted_state" to known event names.
func (r *Registry) DetectEvent(payload map[string]any) (appID, eventName string, ok bool) {
	for key := range payload {
		prefix := key
		if idx := strings.Index(key, "_"); idx > 0 {
			prefix = key[:idx]
		}
		if ref, found := r.prefixToEvent[prefix]; found {
			return ref.App, ref.Event, true
		}
	}

	// Fallback: check for empty-payload events by looking for known event
	// names that have no fields (e.g. OffShootStarted, DisksIdle). These
	// arrive as empty objects — we can't detect them from keys alone.
	// The caller can provide a hint via the envelope.
	return "", "", false
}

// GetEvent returns the event schema for a given app and event name.
func (r *Registry) GetEvent(appID, eventName string) (*Event, bool) {
	app, ok := r.Apps[appID]
	if !ok {
		return nil, false
	}
	evt, ok := app.Events[eventName]
	return evt, ok
}

// AllEvents returns a flat list of all events across all apps.
func (r *Registry) AllEvents() []struct {
	AppID      string
	AppDisplay string
	EventName  string
	Event      *Event
} {
	var result []struct {
		AppID      string
		AppDisplay string
		EventName  string
		Event      *Event
	}
	for _, app := range r.Apps {
		for name, evt := range app.Events {
			result = append(result, struct {
				AppID      string
				AppDisplay string
				EventName  string
				Event      *Event
			}{
				AppID:      app.App,
				AppDisplay: app.DisplayName,
				EventName:  name,
				Event:      evt,
			})
		}
	}
	return result
}
