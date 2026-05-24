package hbvars

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveStoragePathFromBase_ProfilesLayout(t *testing.T) {
	base := t.TempDir()
	profilePath := filepath.Join(base, "profiles", "default", "vars.json")
	if err := os.MkdirAll(filepath.Dir(profilePath), 0o755); err != nil {
		t.Fatalf("mkdir profile dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(base, "profiles.json"), []byte(`{"active":"default"}`), 0o644); err != nil {
		t.Fatalf("write profiles.json: %v", err)
	}
	if err := os.WriteFile(profilePath, []byte(`{"variables":{}}`), 0o644); err != nil {
		t.Fatalf("write vars.json: %v", err)
	}

	gotPath, gotProfile, err := resolveStoragePathFromBase(base)
	if err != nil {
		t.Fatalf("resolveStoragePathFromBase: %v", err)
	}
	if gotProfile != "default" {
		t.Fatalf("profile = %q, want default", gotProfile)
	}
	if gotPath != profilePath {
		t.Fatalf("path = %q, want %q", gotPath, profilePath)
	}
}

func TestResolveStoragePathFromBase_DirectProfileLayoutFallback(t *testing.T) {
	base := t.TempDir()
	profilePath := filepath.Join(base, "studio", "vars.json")
	if err := os.MkdirAll(filepath.Dir(profilePath), 0o755); err != nil {
		t.Fatalf("mkdir profile dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(base, "profiles.json"), []byte(`{"active":"studio"}`), 0o644); err != nil {
		t.Fatalf("write profiles.json: %v", err)
	}
	if err := os.WriteFile(profilePath, []byte(`{"variables":{}}`), 0o644); err != nil {
		t.Fatalf("write vars.json: %v", err)
	}

	gotPath, gotProfile, err := resolveStoragePathFromBase(base)
	if err != nil {
		t.Fatalf("resolveStoragePathFromBase: %v", err)
	}
	if gotProfile != "studio" {
		t.Fatalf("profile = %q, want studio", gotProfile)
	}
	if gotPath != profilePath {
		t.Fatalf("path = %q, want %q", gotPath, profilePath)
	}
}

func TestLoadFromPath_MissingFileReturnsEmptyMap(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing.json")
	variables, err := loadFromPath(path)
	if err != nil {
		t.Fatalf("loadFromPath: %v", err)
	}
	if len(variables) != 0 {
		t.Fatalf("len(variables) = %d, want 0", len(variables))
	}
}

func TestLoadFromPath_MigratesSecureToSecret(t *testing.T) {
	path := filepath.Join(t.TempDir(), "vars.json")
	if err := os.WriteFile(path, []byte(`{
		"variables": {
			"API_KEY": {
				"value": "secret-value",
				"type": "secure",
				"description": "Legacy secure key"
			}
		}
	}`), 0o644); err != nil {
		t.Fatalf("write vars.json: %v", err)
	}

	variables, err := loadFromPath(path)
	if err != nil {
		t.Fatalf("loadFromPath: %v", err)
	}
	variable, ok := variables["API_KEY"]
	if !ok {
		t.Fatal("API_KEY missing from loaded variables")
	}
	if variable.Type != "secret" {
		t.Fatalf("type = %q, want secret", variable.Type)
	}
	if variable.Value != "secret-value" {
		t.Fatalf("value = %q, want secret-value", variable.Value)
	}
}