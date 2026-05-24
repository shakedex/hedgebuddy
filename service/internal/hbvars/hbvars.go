package hbvars

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Variable represents a single HedgeBuddy variable stored in vars.json.
type Variable struct {
	Value       string `json:"value"`
	Type        string `json:"type"`
	Description string `json:"description"`
}

type varsFile struct {
	Variables map[string]Variable `json:"variables"`
}

type profileIndex struct {
	Active string `json:"active"`
}

// StoragePath resolves the active HedgeBuddy vars.json path.
func StoragePath() (string, error) {
	base, err := baseDir()
	if err != nil {
		return "", err
	}
	path, _, err := resolveStoragePathFromBase(base)
	return path, err
}

// ActiveProfile returns the currently active HedgeBuddy profile name.
// Falls back to "default" when no profiles.json exists or it cannot be parsed.
func ActiveProfile() string {
	base, err := baseDir()
	if err != nil {
		return "default"
	}
	_, active, err := resolveStoragePathFromBase(base)
	if err != nil || active == "" {
		return "default"
	}
	return active
}

// Available reports whether a readable vars.json path currently exists.
func Available() bool {
	path, err := StoragePath()
	if err != nil {
		return false
	}
	_, err = os.Stat(path)
	return err == nil
}

// Load reads HedgeBuddy variables from disk.
// Missing vars.json is treated as "no variables" rather than an error.
func Load() (map[string]Variable, error) {
	path, err := StoragePath()
	if err != nil {
		return nil, err
	}
	return loadFromPath(path)
}

// LoadValues reads HedgeBuddy variables and returns just their values.
func LoadValues() (map[string]string, error) {
	variables, err := Load()
	if err != nil {
		return nil, err
	}
	values := make(map[string]string, len(variables))
	for name, variable := range variables {
		values[name] = variable.Value
	}
	return values, nil
}

func loadFromPath(path string) (map[string]Variable, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return map[string]Variable{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read HedgeBuddy vars: %w", err)
	}

	var parsed varsFile
	if err := json.Unmarshal(data, &parsed); err != nil {
		return nil, fmt.Errorf("parse HedgeBuddy vars: %w", err)
	}
	if parsed.Variables == nil {
		return map[string]Variable{}, nil
	}

	for name, variable := range parsed.Variables {
		if variable.Type == "secure" {
			variable.Type = "secret"
			parsed.Variables[name] = variable
		}
	}

	return parsed.Variables, nil
}

func resolveStoragePathFromBase(base string) (string, string, error) {
	active := "default"
	indexPath := filepath.Join(base, "profiles.json")
	if data, err := os.ReadFile(indexPath); err == nil {
		var idx profileIndex
		if err := json.Unmarshal(data, &idx); err == nil && strings.TrimSpace(idx.Active) != "" {
			active = strings.TrimSpace(idx.Active)
		}

		candidates := []string{
			filepath.Join(base, "profiles", active, "vars.json"),
			filepath.Join(base, active, "vars.json"),
		}
		for _, candidate := range candidates {
			if _, err := os.Stat(candidate); err == nil {
				return candidate, active, nil
			}
		}
		return candidates[0], active, nil
	} else if !os.IsNotExist(err) {
		return "", "", fmt.Errorf("read HedgeBuddy profiles index: %w", err)
	}

	return filepath.Join(base, "vars.json"), active, nil
}

func baseDir() (string, error) {
	switch runtime.GOOS {
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			return "", fmt.Errorf("APPDATA environment variable not found")
		}
		return filepath.Join(appData, "HedgeBuddy"), nil
	case "darwin":
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(homeDir, "Library", "Application Support", "HedgeBuddy"), nil
	default:
		if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
			return filepath.Join(xdg, "HedgeBuddy"), nil
		}
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(homeDir, ".local", "share", "HedgeBuddy"), nil
	}
}