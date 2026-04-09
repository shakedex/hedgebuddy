package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"app/internal/profile"

	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// Variable represents a single environment variable
type Variable struct {
	Value       string `json:"value"`
	Type        string `json:"type"` // string, path, url, secret
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

// GetStoragePath returns the vars.json path for the active profile.
// It reads profiles.json to determine the active profile, then resolves
// to profiles/{active}/vars.json.
func GetStoragePath() (string, error) {
	idx, err := profile.LoadIndex()
	if err != nil {
		return "", &StorageError{
			Operation: "get storage path",
			Err:       err,
		}
	}
	// Before migration, profiles.json won't exist yet — fall through to base dir
	if idx == nil {
		return getLegacyStoragePath()
	}
	p, err := profile.ProfileVarsPath(idx.Active)
	if err != nil {
		return "", &StorageError{
			Operation: "get storage path",
			Err:       err,
		}
	}
	return p, nil
}

// GetStoragePathForProfile returns the vars.json path for a specific profile.
func GetStoragePathForProfile(profileName string) (string, error) {
	p, err := profile.ProfileVarsPath(profileName)
	if err != nil {
		return "", &StorageError{
			Operation: "get storage path",
			Err:       err,
		}
	}
	return p, nil
}

// GetBaseDir returns the platform-specific HedgeBuddy data directory.
// This is used by other packages that need the base directory (e.g., prefs).
func GetBaseDir() (string, error) {
	return profile.GetBaseDir()
}

// getLegacyStoragePath returns the old-style flat vars.json path (pre-profiles).
// Only used during migration before profiles.json exists.
func getLegacyStoragePath() (string, error) {
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

// migrateSecureToSecret converts legacy "secure" type to "secret"
func migrateSecureToSecret(variables map[string]Variable) {
	for name, v := range variables {
		if v.Type == "secure" {
			v.Type = "secret"
			variables[name] = v
		}
	}
}

// Load reads the vars.json file
func Load() (*Storage, error) {
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

	var s Storage
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, &StorageError{
			Operation: "parse JSON",
			Err:       err,
		}
	}

	if s.Variables == nil {
		s.Variables = make(map[string]Variable)
	}

	// Backward compat: rename legacy "secure" type to "secret"
	migrateSecureToSecret(s.Variables)

	s.rawJSON = data

	return &s, nil
}

// Save writes the vars.json file
func (s *Storage) Save() error {
	storagePath, err := GetStoragePath()
	if err != nil {
		return err
	}

	dirPath := filepath.Dir(storagePath)
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		return &StorageError{
			Operation: "ensure directory",
			Err:       err,
		}
	}

	var jsonData []byte

	if len(s.rawJSON) > 0 {
		jsonData = s.rawJSON
	} else {
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

	s.rawJSON = jsonData

	// Atomic write: temp file then rename
	tempPath := storagePath + ".tmp"
	if err := os.WriteFile(tempPath, jsonData, 0644); err != nil {
		return &StorageError{
			Operation: "write temp file",
			Err:       err,
		}
	}

	if err := os.Rename(tempPath, storagePath); err != nil {
		os.Remove(tempPath)
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

// GetSortedKeys returns variable names preserving file order (or map order as fallback)
func (s *Storage) GetSortedKeys() []string {
	if len(s.rawJSON) > 0 {
		result := gjson.GetBytes(s.rawJSON, "variables")
		keys := make([]string, 0, len(s.Variables))

		result.ForEach(func(key, value gjson.Result) bool {
			keys = append(keys, key.String())
			return true
		})

		return keys
	}

	keys := make([]string, 0, len(s.Variables))
	for k := range s.Variables {
		keys = append(keys, k)
	}
	return keys
}

// LoadExternalFile loads variables from an external JSON file for preview
// Does NOT modify the current storage
func LoadExternalFile(filePath string) (map[string]Variable, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, &StorageError{
			Operation: "read external file",
			Err:       err,
		}
	}

	var s Storage
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, &StorageError{
			Operation: "parse external JSON",
			Err:       err,
		}
	}

	if s.Variables == nil {
		return make(map[string]Variable), nil
	}

	// Backward compat for imported files too
	migrateSecureToSecret(s.Variables)

	return s.Variables, nil
}

// ImportSummary contains info about imported variables
type ImportSummary struct {
	Added      []string
	Updated    []string
	Duplicates []string
}

// ImportSelectedVariables imports only the variables the user selected from GUI
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

		if err := s.AddVariable(name, variable, true); err != nil {
			return nil, err
		}
	}

	if err := s.Save(); err != nil {
		return nil, err
	}

	return summary, nil
}

// ExportToJSON exports selected variables as a JSON template file
func ExportToJSON(variables map[string]Variable, filePath string) error {
	export := struct {
		Variables map[string]Variable `json:"variables"`
	}{
		Variables: variables,
	}

	data, err := json.MarshalIndent(export, "", "  ")
	if err != nil {
		return &StorageError{
			Operation: "marshal export JSON",
			Err:       err,
		}
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return &StorageError{
			Operation: "write export file",
			Err:       err,
		}
	}

	return nil
}

// ExportToEnv exports selected variables as a .env file (KEY=value format)
func ExportToEnv(variables map[string]Variable, filePath string) error {
	var content []byte
	for name, v := range variables {
		line := fmt.Sprintf("%s=%s\n", name, v.Value)
		content = append(content, []byte(line)...)
	}

	if err := os.WriteFile(filePath, content, 0644); err != nil {
		return &StorageError{
			Operation: "write .env file",
			Err:       err,
		}
	}

	return nil
}
