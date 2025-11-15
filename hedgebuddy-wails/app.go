package main

import (
	"context"
	"os/exec"
	"runtime"

	"hedgebuddy-wails/internal/storage"
	"hedgebuddy-wails/internal/validator"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx     context.Context
	storage *storage.Storage
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize storage
	_, err := storage.InitStorage()
	if err != nil {
		// Log error but continue - we'll try to create it on first save
		println("Warning: failed to initialize storage:", err.Error())
	}

	// Load storage
	store, err := storage.Load()
	if err != nil {
		// If storage fails to load, create empty storage
		store = &storage.Storage{Variables: make(map[string]storage.Variable)}
	}
	a.storage = store
} // GetVariables returns all variables sorted by name
func (a *App) GetVariables() map[string]storage.Variable {
	return a.storage.Variables
}

// GetSortedKeys returns variable names sorted alphabetically
func (a *App) GetSortedKeys() []string {
	return a.storage.GetSortedKeys()
}

// ReloadVariables reloads variables from disk (for manual JSON edits)
func (a *App) ReloadVariables() error {
	store, err := storage.Load()
	if err != nil {
		return err
	}
	a.storage = store
	return nil
}

// AddVariable adds or updates a variable
func (a *App) AddVariable(name, value, varType, description string) error {
	// Validate name
	if err := validator.ValidateVariableName(name); err != nil {
		return err
	}

	// Type-specific validation
	if err := validator.ValidateByType(varType, value); err != nil {
		return err
	}

	// Add variable (don't allow duplicates for new adds)
	err := a.storage.AddVariable(name, storage.Variable{
		Value:       value,
		Type:        varType,
		Description: description,
	}, false)

	if err != nil {
		return err
	}

	// Save
	return a.storage.Save()
}

// DeleteVariable removes a variable
func (a *App) DeleteVariable(name string) error {
	a.storage.DeleteVariable(name)
	return a.storage.Save()
}

// GetStoragePath returns the path to vars.json
func (a *App) GetStoragePath() (string, error) {
	return storage.GetStoragePath()
}

// OpenStorageFolder opens the folder containing vars.json in file explorer
func (a *App) OpenStorageFolder() error {
	path, err := storage.GetStoragePath()
	if err != nil {
		return err
	}

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", "/select,", path)
	case "darwin":
		cmd = exec.Command("open", "-R", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}

	return cmd.Start()
}

// UpdateVariable updates an existing variable
func (a *App) UpdateVariable(oldName, newName, value, varType, description string) error {
	// If name changed, delete old one
	if oldName != newName {
		a.storage.DeleteVariable(oldName)
	}

	// Validate new name
	if err := validator.ValidateVariableName(newName); err != nil {
		return err
	}

	// Type-specific validation
	if err := validator.ValidateByType(varType, value); err != nil {
		return err
	}

	// Add/update variable (allow updates)
	err := a.storage.AddVariable(newName, storage.Variable{
		Value:       value,
		Type:        varType,
		Description: description,
	}, true)

	if err != nil {
		return err
	}

	return a.storage.Save()
}

// LoadExternalVariables loads variables from an external JSON file for preview
// Returns the variables for display in GUI - does NOT import them
func (a *App) LoadExternalVariables(filePath string) (map[string]storage.Variable, error) {
	return storage.LoadExternalFile(filePath)
}

// ImportSelectedVariables imports the user-selected variables from the import dialog
func (a *App) ImportSelectedVariables(selectedVars map[string]storage.Variable) (*storage.ImportSummary, error) {
	return a.storage.ImportSelectedVariables(selectedVars)
}

// OpenFileDialog opens a file picker dialog for selecting JSON files
func (a *App) OpenFileDialog() (string, error) {
	filePath, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select JSON File to Import",
		Filters: []wailsRuntime.FileFilter{
			{
				DisplayName: "JSON Files (*.json)",
				Pattern:     "*.json",
			},
			{
				DisplayName: "All Files (*.*)",
				Pattern:     "*.*",
			},
		},
	})

	if err != nil {
		return "", err
	}

	return filePath, nil
}
