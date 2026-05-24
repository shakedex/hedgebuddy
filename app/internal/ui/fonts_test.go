package ui

import (
	"testing"
)

// TestLoadOSFontsReturnsNilOnMissingFile verifies that a non-existent path
// produces a nil resource — the caller falls back to Fyne's default font.
func TestLoadOSFontsReturnsNilOnMissingFile(t *testing.T) {
	regular, bold := loadFontsFromPaths("/no/such/file.ttf", "/no/such/file-bold.ttf")
	if regular != nil {
		t.Errorf("regular: expected nil, got %v", regular)
	}
	if bold != nil {
		t.Errorf("bold: expected nil, got %v", bold)
	}
}

// TestLoadOSFontsLoadsExistingFile verifies a real file is wrapped in a StaticResource.
func TestLoadOSFontsLoadsExistingFile(t *testing.T) {
	// resources/icon.png exists in this package — we treat it as opaque bytes for the test.
	regular, _ := loadFontsFromPaths("resources/icon.png", "/no/such/bold.ttf")
	if regular == nil {
		t.Fatal("expected regular resource, got nil")
	}
	if len(regular.Content()) == 0 {
		t.Error("expected non-empty resource content")
	}
}
