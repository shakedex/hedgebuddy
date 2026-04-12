package tray

import (
	"fmt"
	"log"
	"os/exec"
	"runtime"
)

// OpenDashboard opens the Quills web UI in the default browser.
func OpenDashboard(port int) {
	url := fmt.Sprintf("http://localhost:%d", port)
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
		log.Printf("[tray] Failed to open browser: %v", err)
	}
}
