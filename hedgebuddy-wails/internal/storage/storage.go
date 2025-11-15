package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// Variable represents a single environment variable
type Variable struct {
	Value       string `json:"value"`
	Type        string `json:"type"` // string, path, url, secure
	Description string `json:"description"`
}

// Storage represents the vars.json structure
type Storage struct {
	Variables map[string]Variable `json:"variables"`
	rawJSON   []byte              // Keep original JSON to preserve order
}

// StorageError represents a storage-related error
type StorageError struct {
	Operation string
	Err       error
}

func (e *StorageError) Error() string {
	return fmt.Sprintf("storage error during %s: %v", e.Operation, e.Err)
}

// DuplicateKeyError represents an attempt to add a duplicate variable
type DuplicateKeyError struct {
	Key string
}

func (e *DuplicateKeyError) Error() string {
	return fmt.Sprintf("variable '%s' already exists", e.Key)
}

// GetStoragePath returns the platform-specific path to vars.json
func GetStoragePath() (string, error) {
	var basePath string

	switch runtime.GOOS {
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			return "", &StorageError{
				Operation: "get storage path",
				Err:       fmt.Errorf("APPDATA environment variable not found"),
			}
		}
		basePath = filepath.Join(appData, "HedgeBuddy")
	case "darwin":
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", &StorageError{
				Operation: "get storage path",
				Err:       err,
			}
		}
		basePath = filepath.Join(homeDir, "Library", "Application Support", "HedgeBuddy")
	default:
		return "", &StorageError{
			Operation: "get storage path",
			Err:       fmt.Errorf("unsupported platform: %s", runtime.GOOS),
		}
	}

	return filepath.Join(basePath, "vars.json"), nil
}

// InitStorage ensures the storage directory and file exist
// Returns true if initialization was needed, false if already existed
func InitStorage() (bool, error) {
	storagePath, err := GetStoragePath()
	if err != nil {
		return false, err
	}

	dirPath := filepath.Dir(storagePath)

	// Check if directory exists
	dirInfo, err := os.Stat(dirPath)
	if os.IsNotExist(err) {
		// Create directory with appropriate permissions
		if err := os.MkdirAll(dirPath, 0755); err != nil {
			return false, &StorageError{
				Operation: "create directory",
				Err:       err,
			}
		}
	} else if err != nil {
		return false, &StorageError{
			Operation: "check directory",
			Err:       err,
		}
	} else if !dirInfo.IsDir() {
		return false, &StorageError{
			Operation: "check directory",
			Err:       fmt.Errorf("path exists but is not a directory: %s", dirPath),
		}
	}

	// Check if vars.json exists
	_, err = os.Stat(storagePath)
	if os.IsNotExist(err) {
		// Create initial empty storage
		initialStorage := &Storage{
			Variables: make(map[string]Variable),
		}
		if err := initialStorage.Save(); err != nil {
			return false, &StorageError{
				Operation: "create initial file",
				Err:       err,
			}
		}
		return true, nil
	} else if err != nil {
		return false, &StorageError{
			Operation: "check file",
			Err:       err,
		}
	}

	return false, nil
}

// Load reads the vars.json file
func Load() (*Storage, error) {
	// Ensure storage is initialized
	if _, err := InitStorage(); err != nil {
		return nil, err
	}

	storagePath, err := GetStoragePath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(storagePath)
	if err != nil {
		return nil, &StorageError{
			Operation: "read file",
			Err:       err,
		}
	}

	var storage Storage
	if err := json.Unmarshal(data, &storage); err != nil {
		return nil, &StorageError{
			Operation: "parse JSON",
			Err:       err,
		}
	}

	if storage.Variables == nil {
		storage.Variables = make(map[string]Variable)
	}

	// Keep raw JSON to preserve order
	storage.rawJSON = data

	return &storage, nil
}

// Save writes the vars.json file
func (s *Storage) Save() error {
	storagePath, err := GetStoragePath()
	if err != nil {
		return err
	}

	// Ensure directory exists
	dirPath := filepath.Dir(storagePath)
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		return &StorageError{
			Operation: "ensure directory",
			Err:       err,
		}
	}

	var jsonData []byte

	// If we have rawJSON, use sjson to selectively update
	// This preserves the original order
	if len(s.rawJSON) > 0 {
		jsonData = s.rawJSON
	} else {
		// First time save - create initial JSON
		initial := map[string]interface{}{
			"variables": make(map[string]Variable),
		}
		jsonData, err = json.MarshalIndent(initial, "", "  ")
		if err != nil {
			return &StorageError{
				Operation: "marshal initial JSON",
				Err:       err,
			}
		}
	}

	// Update all variables in the JSON while preserving order
	for key, variable := range s.Variables {
		varJSON, err := json.Marshal(variable)
		if err != nil {
			return &StorageError{
				Operation: "marshal variable",
				Err:       err,
			}
		}

		path := fmt.Sprintf("variables.%s", key)
		jsonData, err = sjson.SetRawBytes(jsonData, path, varJSON)
		if err != nil {
			return &StorageError{
				Operation: "update variable in JSON",
				Err:       err,
			}
		}
	}

	// Remove deleted variables
	existingKeys := gjson.GetBytes(jsonData, "variables").Map()
	for key := range existingKeys {
		if _, exists := s.Variables[key]; !exists {
			path := fmt.Sprintf("variables.%s", key)
			jsonData, err = sjson.DeleteBytes(jsonData, path)
			if err != nil {
				return &StorageError{
					Operation: "delete variable from JSON",
					Err:       err,
				}
			}
		}
	}

	// Update rawJSON for next save
	s.rawJSON = jsonData

	// Write to temp file first, then rename (atomic write)
	tempPath := storagePath + ".tmp"
	if err := os.WriteFile(tempPath, jsonData, 0644); err != nil {
		return &StorageError{
			Operation: "write temp file",
			Err:       err,
		}
	}

	if err := os.Rename(tempPath, storagePath); err != nil {
		os.Remove(tempPath) // Clean up temp file on error
		return &StorageError{
			Operation: "rename file",
			Err:       err,
		}
	}

	return nil
}

// AddVariable adds or updates a variable
// Set allowUpdate to true to allow overwriting existing variables
func (s *Storage) AddVariable(name string, variable Variable, allowUpdate bool) error {
	if s.Variables == nil {
		s.Variables = make(map[string]Variable)
	}

	// Check for duplicate if not allowing updates
	if !allowUpdate {
		if _, exists := s.Variables[name]; exists {
			return &DuplicateKeyError{Key: name}
		}
	}

	s.Variables[name] = variable
	return nil
}

// DeleteVariable removes a variable
func (s *Storage) DeleteVariable(name string) {
	delete(s.Variables, name)
}

// GetVariable retrieves a variable by name
func (s *Storage) GetVariable(name string) (Variable, bool) {
	v, ok := s.Variables[name]
	return v, ok
}

// GetSortedKeys returns variable names sorted alphabetically
func (s *Storage) GetSortedKeys() []string {
	// If we have rawJSON, preserve the order from the file
	if len(s.rawJSON) > 0 {
		result := gjson.GetBytes(s.rawJSON, "variables")
		keys := make([]string, 0, len(s.Variables))

		result.ForEach(func(key, value gjson.Result) bool {
			keys = append(keys, key.String())
			return true // continue iteration
		})

		return keys
	}

	// Fallback: return keys in map iteration order (if no rawJSON)
	keys := make([]string, 0, len(s.Variables))
	for k := range s.Variables {
		keys = append(keys, k)
	}
	return keys
}

// LoadExternalFile loads variables from an external JSON file for preview
// Does NOT modify the current storage - just returns the data for GUI display
func LoadExternalFile(filePath string) (map[string]Variable, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, &StorageError{
			Operation: "read external file",
			Err:       err,
		}
	}

	var storage Storage
	if err := json.Unmarshal(data, &storage); err != nil {
		return nil, &StorageError{
			Operation: "parse external JSON",
			Err:       err,
		}
	}

	if storage.Variables == nil {
		return make(map[string]Variable), nil
	}

	return storage.Variables, nil
}

// ImportResult contains info about imported variables
type ImportSummary struct {
	Added      []string
	Updated    []string
	Duplicates []string
}

// ImportSelectedVariables imports only the variables the user selected from GUI
// selectedVars is a map of variable names to their (possibly edited) values
// Returns info about what was added vs updated
func (s *Storage) ImportSelectedVariables(selectedVars map[string]Variable) (*ImportSummary, error) {
	if s.Variables == nil {
		s.Variables = make(map[string]Variable)
	}

	summary := &ImportSummary{
		Added:      make([]string, 0),
		Updated:    make([]string, 0),
		Duplicates: make([]string, 0),
	}

	for name, variable := range selectedVars {
		_, exists := s.Variables[name]
		if exists {
			summary.Updated = append(summary.Updated, name)
			summary.Duplicates = append(summary.Duplicates, name)
		} else {
			summary.Added = append(summary.Added, name)
		}

		// Allow updates (overwrite if exists)
		if err := s.AddVariable(name, variable, true); err != nil {
			return nil, err
		}
	}

	if err := s.Save(); err != nil {
		return nil, err
	}

	return summary, nil
}
