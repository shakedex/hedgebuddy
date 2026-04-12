//go:build darwin

package main

import (
	"os/exec"
	"strings"
)

func confirm(message string) bool {
	// osascript dialog returns "button returned:OK" or "button returned:Cancel".
	script := `display dialog "` + message + `" buttons {"Cancel", "Install Now"} default button "Install Now" with title "HedgeBuddy Updater" with icon note`
	out, err := exec.Command("osascript", "-e", script).Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(out), "Install Now")
}

func showError(message string) {
	script := `display dialog "` + message + `" buttons {"OK"} default button "OK" with title "HedgeBuddy Updater" with icon stop`
	_ = exec.Command("osascript", "-e", script).Run()
}
