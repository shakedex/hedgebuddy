package tray

import (
	"log"
	"os"
	"runtime"
	"time"

	"fyne.io/systray"
	"github.com/shakedex/hedgebuddy/service/internal/autostart"
	"github.com/shakedex/hedgebuddy/service/internal/engine"
	"github.com/shakedex/hedgebuddy/service/internal/updatecheck"
	"github.com/shakedex/hedgebuddy/service/internal/version"
)

const releasesURL = "https://github.com/shakedex/hedgebuddy/releases"

// Manager drives the system tray icon and its menu.
type Manager struct {
	port        int
	engine      *engine.Engine
	baseDir     string
	noBrowser   bool
	startServer func()
	onQuit      func()
}

// NewManager creates a tray manager. startServer is called inside onReady
// (should launch the HTTP server in its own goroutine-safe way).
// onQuit is called when the user selects Quit from the tray menu.
func NewManager(port int, eng *engine.Engine, baseDir string, noBrowser bool, startServer func(), onQuit func()) *Manager {
	return &Manager{
		port:        port,
		engine:      eng,
		baseDir:     baseDir,
		noBrowser:   noBrowser,
		startServer: startServer,
		onQuit:      onQuit,
	}
}

// Run starts the system tray. This blocks the calling goroutine (must be main).
func (m *Manager) Run() {
	systray.Run(m.onReady, m.onExit)
}

func (m *Manager) onReady() {
	// Set icon: .ico for Windows, .png for macOS/Linux.
	if runtime.GOOS == "windows" {
		systray.SetIcon(iconICO)
	} else {
		systray.SetIcon(iconPNG)
	}
	systray.SetTooltip("Quills — Hedge Automation Engine")

	// Left-click opens dashboard.
	systray.SetOnTapped(func() {
		OpenDashboard(m.port)
	})

	// Build menu items.
	mDashboard := systray.AddMenuItem("Open Dashboard", "Open the Quills web UI")
	mHedgeBuddy := systray.AddMenuItem("Launch HedgeBuddy", "Open the HedgeBuddy variable manager")
	systray.AddSeparator()
	mPause := systray.AddMenuItem("Pause Engine", "Pause workflow execution")
	mLogs := systray.AddMenuItem("View Logs", "Open the Quills data directory")
	mUpdates := systray.AddMenuItem("Check for Updates", "Check for a newer version of Quills or HedgeBuddy")
	systray.AddSeparator()
	mStartup := systray.AddMenuItemCheckbox("Start at Login", "Launch Quills when you log in", autostart.IsEnabled())
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit Quills", "Shut down the Quills service")

	// Start HTTP server in background.
	go m.startServer()

	// Open browser on startup unless suppressed.
	if !m.noBrowser {
		OpenDashboard(m.port)
	}

	// Menu event loops — one goroutine per item.
	go func() {
		for range mDashboard.ClickedCh {
			OpenDashboard(m.port)
		}
	}()

	go func() {
		for range mHedgeBuddy.ClickedCh {
			launchHedgeBuddy()
		}
	}()

	go func() {
		paused := false
		for range mPause.ClickedCh {
			paused = !paused
			m.engine.SetEngaged(!paused)
			if paused {
				mPause.SetTitle("Resume Engine")
				mPause.SetTooltip("Resume workflow execution")
			} else {
				mPause.SetTitle("Pause Engine")
				mPause.SetTooltip("Pause workflow execution")
			}
		}
	}()

	go func() {
		for range mLogs.ClickedCh {
			OpenFileExplorer(m.baseDir)
		}
	}()

	// Track update state for the click handler.
	type updateState struct {
		app     string // "quills" or "hedgebuddy"
		version string
	}
	var pendingUpdate *updateState

	go func() {
		for range mUpdates.ClickedCh {
			if pendingUpdate != nil {
				// User clicked while "Update Available" — launch updater.
				launchUpdater(pendingUpdate.app, pendingUpdate.version)
			} else {
				// Manual check — show a popup with the result.
				go func() {
					mUpdates.SetTitle("Checking for updates…")
					app, ver := m.checkForUpdate()
					if app != "" {
						pendingUpdate = &updateState{app: app, version: ver}
						mUpdates.SetTitle("Update Available — " + app + " v" + ver)
						showUpdatePopup(app, ver)
					} else {
						mUpdates.SetTitle("Check for Updates")
						showUpToDatePopup()
					}
				}()
			}
		}
	}()

	// Background update check: first run after 2 min, then every 24h.
	// Only changes the menu text passively — no popup.
	go func() {
		time.Sleep(2 * time.Minute)
		if app, ver := m.checkForUpdate(); app != "" {
			pendingUpdate = &updateState{app: app, version: ver}
			mUpdates.SetTitle("Update Available — " + app + " v" + ver)
		}
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			if app, ver := m.checkForUpdate(); app != "" {
				pendingUpdate = &updateState{app: app, version: ver}
				mUpdates.SetTitle("Update Available — " + app + " v" + ver)
			}
		}
	}()

	go func() {
		for range mStartup.ClickedCh {
			if mStartup.Checked() {
				// Currently enabled — disable it.
				if err := autostart.Disable(); err != nil {
					log.Printf("[tray] Failed to disable auto-start: %v", err)
				} else {
					mStartup.Uncheck()
				}
			} else {
				// Currently disabled — enable with current executable path.
				exe, err := os.Executable()
				if err != nil {
					log.Printf("[tray] Failed to resolve executable path: %v", err)
					continue
				}
				if err := autostart.Enable(exe); err != nil {
					log.Printf("[tray] Failed to enable auto-start: %v", err)
				} else {
					mStartup.Check()
				}
			}
		}
	}()

	go func() {
		for range mQuit.ClickedCh {
			systray.Quit()
		}
	}()

	log.Println("[tray] System tray ready")
}

func (m *Manager) onExit() {
	log.Println("[tray] Shutting down from system tray...")
	if m.onQuit != nil {
		m.onQuit()
	}
}

// checkForUpdate queries GitHub for newer Quills/HedgeBuddy releases.
// Returns (app, version) if an update is available, or ("", "") if up to date.
func (m *Manager) checkForUpdate() (app string, ver string) {
	quillsLatest, quillsOutdated, qErr := updatecheck.CheckQuillsUpdate(version.Version)
	if qErr != nil {
		log.Printf("[tray] Update check (quills): %v", qErr)
	}
	if quillsOutdated {
		return "Quills", quillsLatest
	}

	// HedgeBuddy check skipped when we don't know the installed version.
	hbLatest, hbOutdated, hbErr := updatecheck.CheckHedgeBuddyUpdate("")
	if hbErr != nil {
		log.Printf("[tray] Update check (hedgebuddy): %v", hbErr)
	}
	if hbOutdated {
		return "HedgeBuddy", hbLatest
	}

	return "", ""
}
