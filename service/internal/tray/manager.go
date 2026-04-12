package tray

import (
	"log"
	"os"
	"runtime"

	"fyne.io/systray"
	"github.com/shakedex/hedgebuddy/service/internal/autostart"
	"github.com/shakedex/hedgebuddy/service/internal/engine"
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
	systray.AddSeparator()
	mPause := systray.AddMenuItem("Pause Engine", "Pause workflow execution")
	mLogs := systray.AddMenuItem("View Logs", "Open the Quills data directory")
	mUpdates := systray.AddMenuItem("Check for Updates", "Open the releases page")
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

	go func() {
		for range mUpdates.ClickedCh {
			OpenURL(releasesURL)
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
