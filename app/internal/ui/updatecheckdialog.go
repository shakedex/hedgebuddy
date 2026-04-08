package ui

import (
	"fmt"
	"net/url"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"app/internal/pythoncheck"
	"app/internal/updatecheck"
)

const releasesURL = GithubURL + "/releases/latest"

// RunUpdateCheck compares installed versions against the latest releases.
// It should be called from a goroutine after RunPythonCheck.
func (c *AppController) RunUpdateCheck() {
	// We need Python to check the library version.
	pythonStatus := pythoncheck.Detect()

	// Check app update (network).
	appLatest, appOutdated, _ := updatecheck.CheckAppUpdate(AppVersion)

	// Check Python library update (if installed).
	var libOutdated bool
	var libInstalled, libLatest string
	if pythonStatus.PythonFound && pythonStatus.LibraryInstalled {
		libInstalled, libLatest, libOutdated, _ = updatecheck.CheckPyPIUpdate(pythonStatus.Executable)
	}

	if !appOutdated && !libOutdated {
		return // everything up to date
	}

	if appOutdated {
		// Show app update dialog. If the library is also outdated, the user
		// will be prompted to update it after downloading the new app binary
		// and relaunching (the python check runs on every startup).
		showAppUpdateDialog(c.Window, appLatest)
	} else if libOutdated {
		// Only the library is outdated — offer to upgrade it now.
		showLibraryUpdateDialog(c.Window, pythonStatus.Executable, libInstalled, libLatest)
	}
}

// --- App update dialog ---

func showAppUpdateDialog(w fyne.Window, latestVersion string) {
	title := canvas.NewText(
		fmt.Sprintf("HedgeBuddy v%s available", latestVersion),
		ColorAccentBlue,
	)
	title.TextSize = 16
	title.TextStyle = fyne.TextStyle{Bold: true}

	currentLabel := MutedLabel("Current version: v" + AppVersion)

	msg := widget.NewLabel(
		"A new version of HedgeBuddy is available.\n" +
			"Download the latest release, replace your current app,\n" +
			"and relaunch — we'll handle the rest.")
	msg.Wrapping = fyne.TextWrapWord

	content := container.NewVBox(title, currentLabel, msg)

	d := dialog.NewCustomWithoutButtons("Update Available", content, w)

	downloadBtn := widget.NewButton("Download", func() {
		u, _ := url.Parse(releasesURL)
		_ = fyne.CurrentApp().OpenURL(u)
	})
	downloadBtn.Importance = widget.HighImportance

	laterBtn := widget.NewButton("Later", func() { d.Hide() })

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), laterBtn, downloadBtn})
	d.Show()
}

// --- Library update dialog ---

func showLibraryUpdateDialog(w fyne.Window, executable, installed, latest string) {
	title := canvas.NewText(
		fmt.Sprintf("hedgebuddy library v%s available", latest),
		ColorSuccess,
	)
	title.TextSize = 16
	title.TextStyle = fyne.TextStyle{Bold: true}

	currentLabel := MutedLabel("Installed: v" + installed)

	msg := widget.NewLabel(
		"A new version of the hedgebuddy Python library is available.\n" +
			"We can upgrade it for you right now (no admin rights needed).")
	msg.Wrapping = fyne.TextWrapWord

	content := container.NewVBox(title, currentLabel, msg)

	d := dialog.NewCustomWithoutButtons("Library Update", content, w)

	updateBtn := widget.NewButton("Update Now", func() {
		d.Hide()
		showUpgradingDialog(w, executable)
	})
	updateBtn.Importance = widget.HighImportance

	laterBtn := widget.NewButton("Later", func() { d.Hide() })

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), laterBtn, updateBtn})
	d.Show()
}

// --- Upgrading (progress + live console) ---

func showUpgradingDialog(w fyne.Window, executable string) {
	showPipProgressDialog(w, "Upgrading hedgebuddy…", "Upgrading", func(writer *entryWriter) error {
		return pythoncheck.Upgrade(executable, writer)
	}, executable)
}
