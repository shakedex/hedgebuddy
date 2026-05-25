package ui

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"app/internal/prefs"
	"app/internal/storage"
	"app/internal/ui/components"
	"app/internal/ui/icons"
)

// ShowSettingsModal opens the Settings centered modal.
func ShowSettingsModal(c *AppController) {
	pathStr := ""
	if p, err := storage.GetStoragePath(); err == nil {
		pathStr = p
	}
	pathLabel := widget.NewLabel(pathStr)
	pathLabel.Wrapping = fyne.TextWrapWord

	revealBtn := widget.NewButtonWithIcon("Reveal in Finder/Explorer", icons.ExternalLink, func() {
		c.OpenStorageFolder()
	})

	resetPyBtn := widget.NewButton("Reset 'Don't ask again' for Python prompt", func() {
		p, _ := prefs.Load()
		p.PythonCheckDismissed = false
		_ = prefs.Save(p)
		dialog.ShowInformation("Reset", "The Python prompt will reappear on next startup.", c.Window)
	})

	storageSection := container.NewVBox(
		boldSectionLabel("Storage"),
		pathLabel,
		revealBtn,
	)

	pythonSection := container.NewVBox(
		boldSectionLabel("Python prompt"),
		resetPyBtn,
	)

	body := container.NewVBox(
		storageSection,
		widget.NewSeparator(),
		pythonSection,
	)

	closeBtn := widget.NewButton("Close", nil)
	d := components.ShowCustomModal(c.Window, "Settings", body, []fyne.CanvasObject{
		layout.NewSpacer(), closeBtn,
	})
	closeBtn.OnTapped = func() { d.Hide() }
}

func boldSectionLabel(text string) fyne.CanvasObject {
	l := widget.NewLabel(text)
	l.TextStyle = fyne.TextStyle{Bold: true}
	return l
}
