package tray

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"fyne.io/systray"
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

// launchUpdater spawns the updater binary for the given app and version,
// then quits Quills (so the updater can replace it if app == "quills").
// Falls back to opening the releases page if the updater binary is not found.
func launchUpdater(app, version string) {
	exe, err := os.Executable()
	if err != nil {
		log.Printf("[tray] launchUpdater: resolve own path: %v", err)
		OpenURL(releasesURL)
		return
	}
	installDir := filepath.Dir(exe)

	var updaterName string
	if runtime.GOOS == "windows" {
		updaterName = "updater.exe"
	} else {
		updaterName = "updater"
	}

	updaterPath := filepath.Join(installDir, updaterName)
	if _, err := os.Stat(updaterPath); err != nil {
		log.Printf("[tray] updater binary not found at %s — opening releases page", updaterPath)
		OpenURL(releasesURL)
		return
	}

	pid := os.Getpid()
	cmd := exec.Command(updaterPath,
		"--app", app,
		"--version", version,
		"--caller-pid", fmt.Sprintf("%d", pid),
		"--install-dir", installDir,
	)
	if err := cmd.Start(); err != nil {
		log.Printf("[tray] Failed to start updater: %v", err)
		OpenURL(releasesURL)
		return
	}

	// For a Quills self-update the updater will kill this process.
	// For a HedgeBuddy update we just let the updater handle it.
	if app == "quills" {
		systray.Quit()
	}
}
// running Quills binary (as installed by the HedgeBuddy Suite installer).
// Falls back silently if the binary is not present (standalone Quills install).
func launchHedgeBuddy() {
	exe, err := os.Executable()
	if err != nil {
		log.Printf("[tray] launchHedgeBuddy: could not resolve own path: %v", err)
		return
	}

	var hbName string
	if runtime.GOOS == "windows" {
		hbName = "HedgeBuddy.exe"
	} else {
		hbName = "HedgeBuddy"
	}

	hbPath := filepath.Join(filepath.Dir(exe), hbName)
	if _, err := os.Stat(hbPath); err != nil {
		log.Printf("[tray] HedgeBuddy not found at %s — skipping launch", hbPath)
		return
	}

	cmd := exec.Command(hbPath)
	cmd.Dir = filepath.Dir(hbPath)
	if err := cmd.Start(); err != nil {
		log.Printf("[tray] Failed to launch HedgeBuddy: %v", err)
	}
}
