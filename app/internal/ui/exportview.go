package ui

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	fyneStorage "fyne.io/fyne/v2/storage"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	appStorage "app/internal/storage"
)

// NewExportView creates the export view for JSON template and .env formats.
func NewExportView(ctrl *AppController) fyne.CanvasObject {
	keys := ctrl.Storage.GetSortedKeys()

	header := PageHeader(ctrl, "Export Variables")

	if len(keys) == 0 {
		return container.NewBorder(header, nil, nil, nil,
			EmptyState("No variables to export.", "Add some variables first."),
		)
	}

	// Build checkboxes for each variable
	checkboxes := make(map[string]*widget.Check)
	listContainer := container.NewVBox()
	hasSecrets := false

	for _, name := range keys {
		v, _ := ctrl.Storage.GetVariable(name)
		check, card := CheckboxCard(name, v.Type, "")
		checkboxes[name] = check
		listContainer.Add(card)
		if v.Type == TypeSecret {
			hasSecrets = true
		}
	}

	scrollable := container.NewVScroll(listContainer)

	selectAllBtn := widget.NewButton("Select All", func() {
		for _, cb := range checkboxes {
			cb.SetChecked(true)
		}
	})
	deselectAllBtn := widget.NewButton("Deselect All", func() {
		for _, cb := range checkboxes {
			cb.SetChecked(false)
		}
	})

	getSelectedVars := func() map[string]appStorage.Variable {
		selected := make(map[string]appStorage.Variable)
		for name, cb := range checkboxes {
			if cb.Checked {
				if v, ok := ctrl.Storage.GetVariable(name); ok {
					selected[name] = v
				}
			}
		}
		return selected
	}

	doExportJSON := func() {
		selected := getSelectedVars()
		if len(selected) == 0 {
			dialog.ShowInformation("Nothing Selected", "Select at least one variable to export.", ctrl.Window)
			return
		}
		fd := dialog.NewFileSave(func(writer fyne.URIWriteCloser, err error) {
			if err != nil || writer == nil {
				return
			}
			writer.Close()
			if err := appStorage.ExportToJSON(selected, writer.URI().Path()); err != nil {
				dialog.ShowError(err, ctrl.Window)
				return
			}
			ctrl.ShowStatus(fmt.Sprintf("Exported %d variables to JSON", len(selected)))
			ctrl.ShowListView()
		}, ctrl.Window)
		fd.SetFilter(fyneStorage.NewExtensionFileFilter([]string{".json"}))
		fd.SetFileName("hedgebuddy-export.json")
		fd.Show()
	}

	doExportEnv := func() {
		selected := getSelectedVars()
		if len(selected) == 0 {
			dialog.ShowInformation("Nothing Selected", "Select at least one variable to export.", ctrl.Window)
			return
		}

		saveEnv := func() {
			fd := dialog.NewFileSave(func(writer fyne.URIWriteCloser, err error) {
				if err != nil || writer == nil {
					return
				}
				writer.Close()
				if err := appStorage.ExportToEnv(selected, writer.URI().Path()); err != nil {
					dialog.ShowError(err, ctrl.Window)
					return
				}
				ctrl.ShowStatus(fmt.Sprintf("Exported %d variables to .env", len(selected)))
				ctrl.ShowListView()
			}, ctrl.Window)
			fd.SetFilter(fyneStorage.NewExtensionFileFilter([]string{".env"}))
			fd.SetFileName(".env")
			fd.Show()
		}

		// Check for secrets in selection
		hasSelectedSecrets := false
		for name := range selected {
			if v, ok := ctrl.Storage.GetVariable(name); ok && v.Type == TypeSecret {
				hasSelectedSecrets = true
				break
			}
		}

		if hasSelectedSecrets {
			d := dialog.NewCustomWithoutButtons(
				"Secret Values Warning",
				container.NewVBox(
					widget.NewLabel("The export includes secret values which will\nbe written in plain text."),
					MutedLabel("Continue?"),
				),
				ctrl.Window,
			)
			cancelBtn := widget.NewButton("Cancel", func() { d.Hide() })
			continueBtn := widget.NewButton("Export Anyway", func() {
				d.Hide()
				saveEnv()
			})
			continueBtn.Importance = widget.WarningImportance
			d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), cancelBtn, continueBtn})
			d.Show()
		} else {
			saveEnv()
		}
	}

	exportJSONBtn := widget.NewButtonWithIcon("Export as JSON Template", theme.DocumentSaveIcon(), func() {
		doExportJSON()
	})
	exportJSONBtn.Importance = widget.HighImportance

	exportEnvBtn := widget.NewButtonWithIcon("Export as .env", theme.DocumentSaveIcon(), func() {
		doExportEnv()
	})

	// Secret warning banner
	var secretWarningObj fyne.CanvasObject
	if hasSecrets {
		warningText := canvas.NewText("\u26a0 Some variables are secrets \u2014 .env export will include their plain text values.", ColorWarning)
		warningText.TextSize = 12
		secretWarningObj = warningText
	} else {
		secretWarningObj = layout.NewSpacer()
	}

	subtitle := canvas.NewText("Select variables to export:", ColorTextSecond)
	subtitle.TextSize = 14

	topSection := container.NewVBox(
		header,
		subtitle,
		container.NewHBox(selectAllBtn, deselectAllBtn),
		secretWarningObj,
	)

	footer := FooterBar(nil, []fyne.CanvasObject{exportEnvBtn, exportJSONBtn})

	return container.NewBorder(topSection, footer, nil, nil, scrollable)
}
