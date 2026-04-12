package install

import (
	"fmt"
	"os"
	"path/filepath"
)

// Run performs the in-place binary replacement:
//  1. Kill callerPID (the running app being replaced).
//  2. Rename old binary to <name>.bak.
//  3. Move the downloaded .new binary into place.
//  4. Relaunch the new binary.
func Run(installDir, binaryName string, callerPID int) error {
	oldPath := filepath.Join(installDir, binaryName)
	bakPath := oldPath + ".bak"
	newPath := oldPath + ".new"

	// Remove stale .bak from a previous update.
	_ = os.Remove(bakPath)

	// Kill the caller and wait for it to exit.
	if err := killAndWait(callerPID); err != nil {
		return fmt.Errorf("could not stop running process: %w", err)
	}

	// Atomic-ish swap: rename old → .bak, new → old.
	if err := os.Rename(oldPath, bakPath); err != nil {
		return fmt.Errorf("rename old binary: %w", err)
	}
	if err := os.Rename(newPath, oldPath); err != nil {
		// Attempt to roll back.
		_ = os.Rename(bakPath, oldPath)
		return fmt.Errorf("place new binary: %w", err)
	}

	// Relaunch.
	if err := relaunch(oldPath); err != nil {
		return fmt.Errorf("relaunch: %w", err)
	}

	return nil
}
