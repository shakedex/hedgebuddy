package tray

import (
	"fmt"
	"log"
	"os/exec"
	"runtime"
)

// OpenDashboard opens the Quills web UI in the default browser.
func OpenDashboard(port int) {
	OpenURL(fmt.Sprintf("http://localhost:%d", port))
}

// OpenURL opens the given URL in the default browser.
func OpenURL(url string) {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}

	if err := cmd.Start(); err != nil {
		log.Printf("[tray] Failed to open URL %s: %v", url, err)
	}
}

// OpenFileExplorer opens the given directory in the OS file manager.
func OpenFileExplorer(path string) {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", path)
	case "darwin":
		cmd = exec.Command("open", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}

	if err := cmd.Start(); err != nil {
		log.Printf("[tray] Failed to open file explorer at %s: %v", path, err)
	}
}
