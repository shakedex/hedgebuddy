package ui

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	"github.com/ncruces/zenity"

	appStorage "app/internal/storage"
	"app/internal/ui/components"
	"app/internal/ui/tokens"
)

// ShowExportDrawer opens the export drawer.
// Note: secret-warning is shown for .env only in Phase 1.
// Phase 2 extends the warning to JSON export.
func ShowExportDrawer(c *AppController) {
	keys := c.Storage.GetSortedKeys()
	if len(keys) == 0 {
		dialog.ShowInformation("Nothing to export", "Add some variables first.", c.Window)
		return
	}

	checks := make(map[string]*widget.Check)
	listBox := container.NewVBox()

	hasSecrets := false
	for _, name := range keys {
		n := name
		v, _ := c.Storage.GetVariable(n)
		if v.Type == "secret" {
			hasSecrets = true
		}
		cb := widget.NewCheck(fmt.Sprintf("%s  [%s]", n, v.Type), nil)
		cb.SetChecked(true)
		checks[n] = cb
		listBox.Add(cb)
	}

	getSelected := func() map[string]appStorage.Variable {
		out := make(map[string]appStorage.Variable)
		for name, cb := range checks {
			if !cb.Checked {
				continue
			}
			if v, ok := c.Storage.GetVariable(name); ok {
				out[name] = v
			}
		}
		return out
	}

	selectAll := widget.NewButton("Select all", func() {
		for _, cb := range checks {
			cb.SetChecked(true)
		}
	})
	deselectAll := widget.NewButton("Deselect all", func() {
		for _, cb := range checks {
			cb.SetChecked(false)
		}
	})

	var secretWarn fyne.CanvasObject = widget.NewLabel("")
	if hasSecrets {
		w := canvas.NewText("⚠ Some variables are secrets — .env export will include their plain text values.", tokens.Warning)
		w.TextSize = 12
		secretWarn = w
	}

	doExport := func(format string, btn *components.InlineStateButton, saver func(map[string]appStorage.Variable, string) error, fileName, ext string) {
		selected := getSelected()
		if len(selected) == 0 {
			dialog.ShowInformation("Nothing selected", "Select at least one variable to export.", c.Window)
			return
		}
		btn.SetState(components.StateBusy)
		path, err := zenity.SelectFileSave(
			zenity.Title("Export as "+format),
			zenity.ConfirmOverwrite(),
			zenity.Filename(fileName),
			zenity.FileFilters{{Name: format + " files", Patterns: []string{"*." + ext}}},
		)
		if err != nil {
			btn.SetState(components.StateIdle)
			return
		}
		if err := saver(selected, path); err != nil {
			btn.SetState(components.StateError)
			dialog.ShowError(err, c.Window)
			return
		}
		btn.SetState(components.StateDone)
	}

	jsonBtn := components.NewInlineStateButton("Export as JSON", "Exported", "Export failed", nil)
	jsonBtn.Button.OnTapped = func() {
		doExport("JSON", jsonBtn, appStorage.ExportToJSON, "hedgebuddy-export.json", "json")
	}

	envBtn := components.NewInlineStateButton("Export as .env", "Exported", "Export failed", nil)
	envBtn.Button.OnTapped = func() {
		doExport(".env", envBtn, appStorage.ExportToEnv, ".env", "env")
	}

	cancelBtn := widget.NewButton("Cancel", func() { c.CloseDrawer() })

	header := container.NewVBox(
		widget.NewLabel("Select variables to export:"),
		container.NewHBox(selectAll, deselectAll),
		secretWarn,
	)

	footer := components.DrawerFooter(
		[]fyne.CanvasObject{cancelBtn},
		[]fyne.CanvasObject{envBtn.Button, jsonBtn.Button},
	)

	body := container.NewBorder(header, footer, nil, nil, container.NewVScroll(listBox))

	c.OpenDrawer("Export variables", body, nil)
}
