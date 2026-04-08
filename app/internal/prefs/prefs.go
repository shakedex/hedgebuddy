package prefs

import (
	"encoding/json"
	"os"
	"path/filepath"

	"app/internal/storage"
)

// Prefs holds user-facing preferences stored alongside vars.json.
type Prefs struct {
	PythonCheckDismissed bool `json:"python_check_dismissed"`
}

// path returns the absolute path to prefs.json (same directory as vars.json).
func path() (string, error) {
	sp, err := storage.GetStoragePath()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(sp), "prefs.json"), nil
}

// Load reads prefs.json. If the file does not exist a zero-value Prefs is
// returned (not an error).
func Load() (*Prefs, error) {
	p, err := path()
	if err != nil {
		return &Prefs{}, nil
	}
	data, err := os.ReadFile(p)
	if os.IsNotExist(err) {
		return &Prefs{}, nil
	}
	if err != nil {
		return nil, err
	}
	var prefs Prefs
	if err := json.Unmarshal(data, &prefs); err != nil {
		return &Prefs{}, nil // corrupt file — treat as fresh
	}
	return &prefs, nil
}

// Save writes prefs.json atomically via temp-file + rename.
func Save(prefs *Prefs) error {
	p, err := path()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(prefs, "", "  ")
	if err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}
