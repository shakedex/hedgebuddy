package actions

// ActionMeta describes a registered action for the frontend.
type ActionMeta struct {
	Name        string       `json:"name"`
	Category    string       `json:"category"`
	Description string       `json:"description"`
	Inputs      []InputMeta  `json:"inputs"`
	Outputs     []OutputMeta `json:"outputs"`
}

// InputMeta describes an input parameter for an action.
type InputMeta struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"` // string, path, url, number, boolean, enum
	Required    bool     `json:"required"`
	Description string   `json:"description"`
	Default     string   `json:"default,omitempty"`
	Values      []string `json:"values,omitempty"` // for enum type
}

// OutputMeta describes a single field in an action's output.
type OutputMeta struct {
	Name        string `json:"name"`
	Type        string `json:"type"` // string, number, boolean, path, object, any
	Description string `json:"description"`
}

// AllMeta returns metadata for all registered actions, collected from each action's Meta() method.
func (r *Registry) AllMeta() []ActionMeta {
	r.mu.RLock()
	defer r.mu.RUnlock()
	metas := make([]ActionMeta, 0, len(r.actions))
	for _, a := range r.actions {
		metas = append(metas, a.Meta())
	}
	return metas
}
