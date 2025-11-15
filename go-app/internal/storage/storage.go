package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
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
}

// GetStoragePath returns the platform-specific path to vars.json
func GetStoragePath() (string, error) {
	var basePath string

	switch runtime.GOOS {
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			return "", fmt.Errorf("APPDATA environment variable not found")
		}
		basePath = filepath.Join(appData, "HedgeBuddy")
	case "darwin":
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		basePath = filepath.Join(homeDir, "Library", "Application Support", "HedgeBuddy")
	default:
		return "", fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}

	// Ensure directory exists
	if err := os.MkdirAll(basePath, 0755); err != nil {
		return "", err
	}

	return filepath.Join(basePath, "vars.json"), nil
}

// Load reads the vars.json file
func Load() (*Storage, error) {
	storagePath, err := GetStoragePath()
	if err != nil {
		return nil, err
	}

	// If file doesn't exist, return empty storage
	if _, err := os.Stat(storagePath); os.IsNotExist(err) {
		return &Storage{Variables: make(map[string]Variable)}, nil
	}

	data, err := os.ReadFile(storagePath)
	if err != nil {
		return nil, err
	}

	var storage Storage
	if err := json.Unmarshal(data, &storage); err != nil {
		return nil, err
	}

	if storage.Variables == nil {
		storage.Variables = make(map[string]Variable)
	}

	return &storage, nil
}

// Save writes the vars.json file
func (s *Storage) Save() error {
	storagePath, err := GetStoragePath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(storagePath, data, 0644)
}

// AddVariable adds or updates a variable
func (s *Storage) AddVariable(name string, variable Variable) {
	if s.Variables == nil {
		s.Variables = make(map[string]Variable)
	}
	s.Variables[name] = variable
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
	keys := make([]string, 0, len(s.Variables))
	for k := range s.Variables {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
