package profile

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"time"
)

// ProfileMeta holds metadata for a single profile.
type ProfileMeta struct {
	Description string `json:"description"`
	Created     string `json:"created"`
}

// ProfileIndex is the top-level structure stored in profiles.json.
type ProfileIndex struct {
	Active   string                 `json:"active"`
	Profiles map[string]ProfileMeta `json:"profiles"`
}

// GetBaseDir returns the platform-specific HedgeBuddy data directory.
func GetBaseDir() (string, error) {
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
		return "", fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}

// indexPath returns the absolute path to profiles.json.
func indexPath() (string, error) {
	base, err := GetBaseDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "profiles.json"), nil
}

// ProfilesDir returns the absolute path to the profiles/ directory.
func ProfilesDir() (string, error) {
	base, err := GetBaseDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "profiles"), nil
}

// ProfileVarsPath returns the vars.json path for a given profile name.
func ProfileVarsPath(name string) (string, error) {
	dir, err := ProfilesDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, name, "vars.json"), nil
}

// LoadIndex reads profiles.json from disk. Returns nil if the file does not exist.
func LoadIndex() (*ProfileIndex, error) {
	p, err := indexPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(p)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read profiles.json: %w", err)
	}
	var idx ProfileIndex
	if err := json.Unmarshal(data, &idx); err != nil {
		return nil, fmt.Errorf("parse profiles.json: %w", err)
	}
	if idx.Profiles == nil {
		idx.Profiles = make(map[string]ProfileMeta)
	}
	return &idx, nil
}

// SaveIndex writes profiles.json atomically.
func SaveIndex(idx *ProfileIndex) error {
	p, err := indexPath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(idx, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal profiles.json: %w", err)
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return fmt.Errorf("write profiles.json: %w", err)
	}
	if err := os.Rename(tmp, p); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("rename profiles.json: %w", err)
	}
	return nil
}

// Migrate performs a one-time migration from the flat vars.json layout to
// the profiles-based layout. If profiles/ already exists, it's a no-op.
//
// Steps:
//  1. Create profiles/default/ directory
//  2. Move existing vars.json into profiles/default/vars.json
//  3. Create profiles.json with active = "default"
func Migrate() error {
	base, err := GetBaseDir()
	if err != nil {
		return err
	}

	profilesDir := filepath.Join(base, "profiles")
	if info, err := os.Stat(profilesDir); err == nil && info.IsDir() {
		// Already migrated — validate that profiles.json exists
		if _, err := os.Stat(filepath.Join(base, "profiles.json")); os.IsNotExist(err) {
			// profiles/ exists but no index — rebuild from directories
			return rebuildIndex(base, profilesDir)
		}
		return nil
	}

	// Create profiles/default directory
	defaultDir := filepath.Join(profilesDir, "default")
	if err := os.MkdirAll(defaultDir, 0755); err != nil {
		return fmt.Errorf("create profiles/default: %w", err)
	}

	// Move existing vars.json if it exists
	oldVarsPath := filepath.Join(base, "vars.json")
	newVarsPath := filepath.Join(defaultDir, "vars.json")

	if _, err := os.Stat(oldVarsPath); err == nil {
		data, err := os.ReadFile(oldVarsPath)
		if err != nil {
			return fmt.Errorf("read old vars.json: %w", err)
		}
		if err := os.WriteFile(newVarsPath, data, 0644); err != nil {
			return fmt.Errorf("write new vars.json: %w", err)
		}
		os.Remove(oldVarsPath)
	} else {
		// No existing vars.json — create empty one
		empty := []byte(`{"variables":{}}`)
		if err := os.WriteFile(newVarsPath, empty, 0644); err != nil {
			return fmt.Errorf("create empty vars.json: %w", err)
		}
	}

	// Create profiles.json
	idx := &ProfileIndex{
		Active: "default",
		Profiles: map[string]ProfileMeta{
			"default": {
				Description: "Default profile",
				Created:     time.Now().Format(time.RFC3339),
			},
		},
	}
	return SaveIndex(idx)
}

// rebuildIndex creates a profiles.json from existing profile directories.
func rebuildIndex(base, profilesDir string) error {
	entries, err := os.ReadDir(profilesDir)
	if err != nil {
		return fmt.Errorf("read profiles dir: %w", err)
	}
	idx := &ProfileIndex{
		Active:   "default",
		Profiles: make(map[string]ProfileMeta),
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		varsPath := filepath.Join(profilesDir, e.Name(), "vars.json")
		if _, err := os.Stat(varsPath); err == nil {
			idx.Profiles[e.Name()] = ProfileMeta{
				Description: "",
				Created:     time.Now().Format(time.RFC3339),
			}
		}
	}
	// Ensure default exists
	if _, ok := idx.Profiles["default"]; !ok {
		defaultDir := filepath.Join(profilesDir, "default")
		os.MkdirAll(defaultDir, 0755)
		os.WriteFile(filepath.Join(defaultDir, "vars.json"), []byte(`{"variables":{}}`), 0644)
		idx.Profiles["default"] = ProfileMeta{
			Description: "Default profile",
			Created:     time.Now().Format(time.RFC3339),
		}
	}
	// Make sure active profile exists
	if _, ok := idx.Profiles[idx.Active]; !ok {
		idx.Active = "default"
	}
	return SaveIndex(idx)
}

// ListProfiles returns profile names sorted alphabetically, with "default" always first.
func ListProfiles(idx *ProfileIndex) []string {
	names := make([]string, 0, len(idx.Profiles))
	for name := range idx.Profiles {
		if name != "default" {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	// default always first
	return append([]string{"default"}, names...)
}

// CreateProfile creates a new profile with an empty vars.json.
func CreateProfile(idx *ProfileIndex, name, description string) error {
	if _, exists := idx.Profiles[name]; exists {
		return fmt.Errorf("profile '%s' already exists", name)
	}
	dir, err := ProfilesDir()
	if err != nil {
		return err
	}
	profileDir := filepath.Join(dir, name)
	if err := os.MkdirAll(profileDir, 0755); err != nil {
		return fmt.Errorf("create profile directory: %w", err)
	}
	varsPath := filepath.Join(profileDir, "vars.json")
	if err := os.WriteFile(varsPath, []byte(`{"variables":{}}`), 0644); err != nil {
		return fmt.Errorf("create vars.json: %w", err)
	}
	idx.Profiles[name] = ProfileMeta{
		Description: description,
		Created:     time.Now().Format(time.RFC3339),
	}
	return SaveIndex(idx)
}

// DeleteProfile removes a profile. Cannot delete "default" or the active profile.
func DeleteProfile(idx *ProfileIndex, name string) error {
	if name == "default" {
		return fmt.Errorf("cannot delete the default profile")
	}
	if name == idx.Active {
		return fmt.Errorf("cannot delete the active profile — switch to another profile first")
	}
	if _, exists := idx.Profiles[name]; !exists {
		return fmt.Errorf("profile '%s' does not exist", name)
	}
	dir, err := ProfilesDir()
	if err != nil {
		return err
	}
	profileDir := filepath.Join(dir, name)
	if err := os.RemoveAll(profileDir); err != nil {
		return fmt.Errorf("remove profile directory: %w", err)
	}
	delete(idx.Profiles, name)
	return SaveIndex(idx)
}

// RenameProfile renames a profile directory and updates the index.
func RenameProfile(idx *ProfileIndex, oldName, newName string) error {
	if oldName == "default" {
		return fmt.Errorf("cannot rename the default profile")
	}
	if _, exists := idx.Profiles[oldName]; !exists {
		return fmt.Errorf("profile '%s' does not exist", oldName)
	}
	if _, exists := idx.Profiles[newName]; exists {
		return fmt.Errorf("profile '%s' already exists", newName)
	}
	dir, err := ProfilesDir()
	if err != nil {
		return err
	}
	if err := os.Rename(filepath.Join(dir, oldName), filepath.Join(dir, newName)); err != nil {
		return fmt.Errorf("rename profile directory: %w", err)
	}
	meta := idx.Profiles[oldName]
	delete(idx.Profiles, oldName)
	idx.Profiles[newName] = meta
	if idx.Active == oldName {
		idx.Active = newName
	}
	return SaveIndex(idx)
}

// DuplicateProfile copies a profile's vars.json into a new profile.
func DuplicateProfile(idx *ProfileIndex, srcName, newName string) error {
	if _, exists := idx.Profiles[srcName]; !exists {
		return fmt.Errorf("source profile '%s' does not exist", srcName)
	}
	if _, exists := idx.Profiles[newName]; exists {
		return fmt.Errorf("profile '%s' already exists", newName)
	}
	dir, err := ProfilesDir()
	if err != nil {
		return err
	}
	srcVars := filepath.Join(dir, srcName, "vars.json")
	data, err := os.ReadFile(srcVars)
	if err != nil {
		return fmt.Errorf("read source vars.json: %w", err)
	}
	newDir := filepath.Join(dir, newName)
	if err := os.MkdirAll(newDir, 0755); err != nil {
		return fmt.Errorf("create profile directory: %w", err)
	}
	if err := os.WriteFile(filepath.Join(newDir, "vars.json"), data, 0644); err != nil {
		return fmt.Errorf("write new vars.json: %w", err)
	}
	srcMeta := idx.Profiles[srcName]
	idx.Profiles[newName] = ProfileMeta{
		Description: srcMeta.Description,
		Created:     time.Now().Format(time.RFC3339),
	}
	return SaveIndex(idx)
}

// SetActiveProfile switches the active profile.
func SetActiveProfile(idx *ProfileIndex, name string) error {
	if _, exists := idx.Profiles[name]; !exists {
		return fmt.Errorf("profile '%s' does not exist", name)
	}
	idx.Active = name
	return SaveIndex(idx)
}

// UpdateDescription updates a profile's description.
func UpdateDescription(idx *ProfileIndex, name, description string) error {
	meta, exists := idx.Profiles[name]
	if !exists {
		return fmt.Errorf("profile '%s' does not exist", name)
	}
	meta.Description = description
	idx.Profiles[name] = meta
	return SaveIndex(idx)
}

// ImportAsProfile creates a new profile from an external vars.json file.
func ImportAsProfile(idx *ProfileIndex, name, description, srcFilePath string) error {
	if _, exists := idx.Profiles[name]; exists {
		return fmt.Errorf("profile '%s' already exists", name)
	}
	data, err := os.ReadFile(srcFilePath)
	if err != nil {
		return fmt.Errorf("read source file: %w", err)
	}
	// Validate it's valid JSON with a "variables" key
	var check struct {
		Variables map[string]json.RawMessage `json:"variables"`
	}
	if err := json.Unmarshal(data, &check); err != nil {
		return fmt.Errorf("invalid JSON template: %w", err)
	}

	dir, err := ProfilesDir()
	if err != nil {
		return err
	}
	newDir := filepath.Join(dir, name)
	if err := os.MkdirAll(newDir, 0755); err != nil {
		return fmt.Errorf("create profile directory: %w", err)
	}
	if err := os.WriteFile(filepath.Join(newDir, "vars.json"), data, 0644); err != nil {
		return fmt.Errorf("write vars.json: %w", err)
	}
	idx.Profiles[name] = ProfileMeta{
		Description: description,
		Created:     time.Now().Format(time.RFC3339),
	}
	return SaveIndex(idx)
}

// CountVariables returns the number of variables in a profile's vars.json.
func CountVariables(name string) int {
	path, err := ProfileVarsPath(name)
	if err != nil {
		return 0
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	var s struct {
		Variables map[string]json.RawMessage `json:"variables"`
	}
	if err := json.Unmarshal(data, &s); err != nil {
		return 0
	}
	return len(s.Variables)
}
