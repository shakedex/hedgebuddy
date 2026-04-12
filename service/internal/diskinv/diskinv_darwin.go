//go:build darwin

package diskinv

import (
	"os"
	"path/filepath"
)

// Snapshot returns the set of currently-mounted volume paths on macOS
// (e.g. {"/Volumes/Untitled": true}).  The root volume "/" is always included.
func Snapshot() map[string]bool {
	drives := map[string]bool{"/": true}

	entries, err := os.ReadDir("/Volumes")
	if err != nil {
		return drives
	}
	for _, e := range entries {
		drives[filepath.Join("/Volumes", e.Name())] = true
	}
	return drives
}
