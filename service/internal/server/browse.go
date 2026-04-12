package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type browseEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
}

func (s *Server) handleBrowse(w http.ResponseWriter, r *http.Request) {
	requestedPath := r.URL.Query().Get("path")

	// On Windows with no path, list available drive letters.
	if requestedPath == "" && runtime.GOOS == "windows" {
		drives := listWindowsDrives()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"path":    "",
			"entries": drives,
		})
		return
	}

	// Default to user home directory on non-Windows (or if drives detection fails).
	if requestedPath == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			http.Error(w, "cannot determine home directory", http.StatusInternalServerError)
			return
		}
		requestedPath = home
	}

	// Clean the path to prevent traversal attacks.
	cleanPath := filepath.Clean(requestedPath)

	// On Windows, reject paths that try to escape via .. after cleaning.
	if strings.Contains(cleanPath, "..") {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	// Reject non-absolute paths.
	if !filepath.IsAbs(cleanPath) {
		http.Error(w, "path must be absolute", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(cleanPath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "path not found", http.StatusNotFound)
			return
		}
		http.Error(w, "cannot access path", http.StatusForbidden)
		return
	}

	if !info.IsDir() {
		http.Error(w, "path is not a directory", http.StatusBadRequest)
		return
	}

	dirEntries, err := os.ReadDir(cleanPath)
	if err != nil {
		http.Error(w, "cannot read directory", http.StatusForbidden)
		return
	}

	entries := make([]browseEntry, 0, len(dirEntries))

	// Add parent directory entry if not at root.
	parent := filepath.Dir(cleanPath)
	if parent != cleanPath {
		entries = append(entries, browseEntry{
			Name:  "..",
			Path:  parent,
			IsDir: true,
		})
	}

	for _, de := range dirEntries {
		// Skip hidden files/dirs on Unix, skip system dirs on Windows.
		name := de.Name()
		if shouldSkipEntry(name) {
			continue
		}

		entries = append(entries, browseEntry{
			Name:  name,
			Path:  filepath.Join(cleanPath, name),
			IsDir: de.IsDir(),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"path":    cleanPath,
		"entries": entries,
	})
}

func shouldSkipEntry(name string) bool {
	// Skip hidden files on all platforms.
	if strings.HasPrefix(name, ".") {
		return true
	}
	// Skip common system directories on Windows.
	if runtime.GOOS == "windows" {
		lower := strings.ToLower(name)
		switch lower {
		case "$recycle.bin", "system volume information", "recovery":
			return true
		}
	}
	return false
}

// listWindowsDrives returns available drive letters (C:\, D:\, etc.).
func listWindowsDrives() []browseEntry {
	var drives []browseEntry
	for letter := 'A'; letter <= 'Z'; letter++ {
		root := string(letter) + `:\`
		if _, err := os.Stat(root); err == nil {
			drives = append(drives, browseEntry{
				Name:  root,
				Path:  root,
				IsDir: true,
			})
		}
	}
	return drives
}
