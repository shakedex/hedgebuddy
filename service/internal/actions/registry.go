package actions

import (
	"fmt"
	"sync"
)

// Context holds execution state passed through a quill chain.
type Context struct {
	Event     map[string]any    // Raw event payload
	Inputs    map[string]string // Resolved quill step inputs
	Settings  map[string]string // Persistent quill-level settings
	Steps     map[string]any    // Named outputs from previous steps
	AppID     string            // Source app (e.g. "offshoot")
	EventName string            // Event type (e.g. "FileCopyCompleted")
	StepIndex int               // 0-based index of the current workflow step
}

// Result is the output of a single action execution.
type Result struct {
	Output any    `json:"output,omitempty"`
	Error  string `json:"error,omitempty"`
	OK     bool   `json:"ok"`
}

// Action is a built-in action that can be executed as a step in a quill chain.
type Action interface {
	// Name returns the action identifier (e.g. "http.post", "file.move").
	Name() string
	// Meta returns the action's metadata for the frontend.
	Meta() ActionMeta
	// Execute runs the action with the given config and execution context.
	Execute(config map[string]any, ctx *Context) Result
}

// Registry holds all registered actions.
type Registry struct {
	mu      sync.RWMutex
	actions map[string]Action
}

// NewRegistry creates a registry with all built-in actions registered.
func NewRegistry() *Registry {
	r := &Registry{actions: make(map[string]Action)}

	// Core actions
	r.Register(&HTTPGetAction{})
	r.Register(&HTTPPostAction{})
	r.Register(&HTTPPutAction{})
	r.Register(&HTTPPatchAction{})
	r.Register(&HTTPDeleteAction{})
	r.Register(&HTTPUploadAction{})
	r.Register(&FileMoveAction{})
	r.Register(&FileCopyAction{})
	r.Register(&FileWriteAction{})
	r.Register(&FileAppendAction{})
	r.Register(&FileReadAction{})
	r.Register(&LogWriteAction{})
	r.Register(&TemplateRenderAction{})
	r.Register(&JSONExtractAction{})

	// Condition
	r.Register(&ConditionMatchAction{})

	// FTP/SFTP
	r.Register(&FTPUploadAction{})

	// OffShoot app control
	r.Register(&OffShootOpenAction{})
	r.Register(&OffShootQuitAction{})
	r.Register(&OffShootSetSourceAction{})
	r.Register(&OffShootSetDestinationAction{})
	r.Register(&OffShootAddTransfersAction{})
	r.Register(&OffShootResetAction{})
	r.Register(&OffShootReloadPresetsAction{})
	r.Register(&OffShootChainAction{})

	// FoolCat app control
	r.Register(&FoolCatOpenAction{})
	r.Register(&FoolCatCreateAction{})

	// EditReady app control
	r.Register(&EditReadyOpenAction{})
	r.Register(&EditReadyAddAction{})
	r.Register(&EditReadyTranscodeAction{})

	// Delay
	r.Register(&DelayWaitAction{})

	// Shell
	r.Register(&ShellExecAction{})

	return r
}

// Register adds an action to the registry.
func (r *Registry) Register(a Action) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.actions[a.Name()] = a
}

// Get returns an action by name.
func (r *Registry) Get(name string) (Action, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	a, ok := r.actions[name]
	if !ok {
		return nil, fmt.Errorf("unknown action: %s", name)
	}
	return a, nil
}

// List returns all registered action names.
func (r *Registry) List() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.actions))
	for name := range r.actions {
		names = append(names, name)
	}
	return names
}
