//go:build !windows && !darwin

package tray

import "log"

// showUpdatePopup falls back to logging on unsupported platforms.
func showUpdatePopup(app, version string) {
	log.Printf("[tray] Update available: %s v%s — click the tray item to update", app, version)
}

// showUpToDatePopup falls back to logging on unsupported platforms.
func showUpToDatePopup() {
	log.Println("[tray] Everything is up to date")
}
