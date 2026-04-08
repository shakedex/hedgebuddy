package ui

import (
	"fmt"
	"net/url"
	"sync"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"app/internal/prefs"
	"app/internal/pythoncheck"
)

const pythonDownloadURL = "https://www.python.org/downloads/"

// RunPythonCheck checks for Python + hedgebuddy library on startup.
// It should be called from a goroutine so the UI stays responsive.
func (c *AppController) RunPythonCheck() {
	p, _ := prefs.Load()
	if p.PythonCheckDismissed {
		return
	}

	status := pythoncheck.Detect()
	if status.PythonFound && status.LibraryInstalled {
		return
	}

	if !status.PythonFound {
		showPythonNotFoundDialog(c.Window)
	} else {
		showLibraryMissingDialog(c.Window, status.Executable)
	}
}

// --- Python not found ---

func showPythonNotFoundDialog(w fyne.Window) {
	title := canvas.NewText("Python is not installed", ColorAccentRed)
	title.TextSize = 16
	title.TextStyle = fyne.TextStyle{Bold: true}

	msg := widget.NewLabel(
		"HedgeBuddy requires Python to run your scripts.\n\n" +
			"We couldn't find a Python installation on this computer.\n" +
			"Please install Python, then relaunch HedgeBuddy — we'll\n" +
			"finish setup automatically.")
	msg.Wrapping = fyne.TextWrapWord

	content := container.NewVBox(title, msg)

	d := dialog.NewCustomWithoutButtons("Python Not Found", content, w)

	downloadBtn := widget.NewButton("Download Python", func() {
		u, _ := url.Parse(pythonDownloadURL)
		_ = fyne.CurrentApp().OpenURL(u)
	})
	downloadBtn.Importance = widget.HighImportance

	dismissBtn := widget.NewButton("Don't Ask Again", func() {
		d.Hide()
		dismissPythonCheck()
	})

	closeBtn := widget.NewButton("Close", func() { d.Hide() })

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), dismissBtn, closeBtn, downloadBtn})
	d.Show()
}

// --- Library not installed ---

func showLibraryMissingDialog(w fyne.Window, executable string) {
	title := canvas.NewText("HedgeBuddy Python library not installed", ColorWarning)
	title.TextSize = 16
	title.TextStyle = fyne.TextStyle{Bold: true}

	msg := widget.NewLabel(
		"Python is installed — great!\n\n" +
			"The hedgebuddy library is required for your Python scripts to\n" +
			"read variables managed by this app. We can install it for you\n" +
			"right now (no admin rights needed).")
	msg.Wrapping = fyne.TextWrapWord

	content := container.NewVBox(title, msg)

	d := dialog.NewCustomWithoutButtons("Library Not Installed", content, w)

	installBtn := widget.NewButton("Install Now", func() {
		d.Hide()
		showInstallingDialog(w, executable)
	})
	installBtn.Importance = widget.HighImportance

	dismissBtn := widget.NewButton("Don't Ask Again", func() {
		d.Hide()
		dismissPythonCheck()
	})

	skipBtn := widget.NewButton("Skip", func() { d.Hide() })

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), dismissBtn, skipBtn, installBtn})
	d.Show()
}

// --- Installing (progress + live console) ---

func showInstallingDialog(w fyne.Window, executable string) {
	showPipProgressDialog(w, "Installing hedgebuddy…", "Installing", func(writer *entryWriter) error {
		return pythoncheck.Install(executable, writer)
	}, executable)
}

// showPipProgressDialog runs a pip operation with a live console log.
// The console stays visible after completion so the user can review it.
func showPipProgressDialog(w fyne.Window, label, title string, run func(*entryWriter) error, executable string) {
	progress := widget.NewProgressBarInfinite()

	statusLabel := canvas.NewText(label, ColorTextPrimary)
	statusLabel.TextSize = 14
	statusLabel.TextStyle = fyne.TextStyle{Bold: true}

	logEntry := widget.NewMultiLineEntry()
	logEntry.Wrapping = fyne.TextWrapWord
	logEntry.Disable() // read-only, but still scrollable & selectable
	logEntry.SetMinRowsVisible(12)

	content := container.NewVBox(
		statusLabel,
		progress,
		widget.NewSeparator(),
		container.NewStack(logEntry),
	)

	d := dialog.NewCustomWithoutButtons(title, content, w)
	d.Resize(fyne.NewSize(560, 400))
	d.Show()

	go func() {
		writer := &entryWriter{entry: logEntry}
		err := run(writer)

		// Stop the spinner — keep the log visible for review.
		progress.Hide()

		if err != nil {
			statusLabel.Text = "Installation failed"
			statusLabel.Color = ColorAccentRed
			statusLabel.Refresh()

			hint := MutedLabel(fmt.Sprintf("You can also run manually: %s -m pip install hedgebuddy", executable))
			content.Add(hint)
		} else {
			statusLabel.Text = "✓ Installed successfully"
			statusLabel.Color = ColorSuccess
			statusLabel.Refresh()
		}

		closeBtn := widget.NewButton("Close", func() { d.Hide() })
		d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), closeBtn})
	}()
}

// --- helpers ---

// dismissPythonCheck saves the "don't ask again" preference.
func dismissPythonCheck() {
	p, _ := prefs.Load()
	p.PythonCheckDismissed = true
	_ = prefs.Save(p)
}

// entryWriter is a thread-safe io.Writer that appends to a Fyne MultiLineEntry.
type entryWriter struct {
	mu    sync.Mutex
	entry *widget.Entry
}

func (ew *entryWriter) Write(p []byte) (int, error) {
	ew.mu.Lock()
	defer ew.mu.Unlock()
	ew.entry.SetText(ew.entry.Text + string(p))
	// auto-scroll to bottom
	ew.entry.CursorRow = len(ew.entry.Text)
	ew.entry.Refresh()
	return len(p), nil
}
