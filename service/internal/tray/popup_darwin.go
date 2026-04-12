//go:build darwin

package tray

import (
	"fmt"
	"os/exec"
	"strings"
)

// showUpdatePopup shows a native dialog informing the user an update is
// available and asking whether to launch the updater now.
func showUpdatePopup(app, version string) {
	script := fmt.Sprintf(
		`display dialog "%s v%s is available." buttons {"Later", "Update Now"} default button "Update Now" with title "Quills — Update Available" with icon note`,
		app, version,
	)
	out, err := exec.Command("osascript", "-e", script).Output()
	if err != nil {
		return
	}
	if strings.Contains(string(out), "Update Now") {
		launchUpdater(app, version)
	}
}

// showUpToDatePopup shows a native info dialog confirming everything is current.
func showUpToDatePopup() {
	script := `display dialog "Everything is up to date!" buttons {"OK"} default button "OK" with title "Quills — Up to Date" with icon note`
	_ = exec.Command("osascript", "-e", script).Run()
}
