package ui

import (
	"fmt"
	"path/filepath"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/storage"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	appStorage "app/internal/storage"
)

// NewImportView creates the bulk import view.
func NewImportView(ctrl *AppController) fyne.CanvasObject {
	fileLabel := canvas.NewText("No file selected", ColorTextMuted)
	fileLabel.TextSize = 14

	var loadedVars map[string]appStorage.Variable
	var checkboxes map[string]*widget.Check
	var editedValues map[string]*widget.Entry

	listContainer := container.NewVBox()
	scrollable := container.NewVScroll(listContainer)

	selectAllBtn := widget.NewButton("Select All", nil)
	deselectAllBtn := widget.NewButton("Deselect All", nil)
	importBtn := widget.NewButtonWithIcon("Import Selected", theme.ConfirmIcon(), nil)
	importBtn.Importance = widget.HighImportance
	importBtn.Disable()
	selectAllBtn.Disable()
	deselectAllBtn.Disable()

	buildList := func() {
		listContainer.Objects = nil
		checkboxes = make(map[string]*widget.Check)
		editedValues = make(map[string]*widget.Entry)

		for name, v := range loadedVars {
			varName := name
			varData := v

			warning := ""
			if _, exists := ctrl.Storage.GetVariable(varName); exists {
				warning = "\u26a0 exists \u2014 will overwrite"
			}
			check, card := CheckboxCard(varName, varData.Type, warning)
			checkboxes[varName] = check

			valueEntry := widget.NewEntry()
			valueEntry.SetText(varData.Value)
			editedValues[varName] = valueEntry

			descLabel := widget.NewLabel(varData.Description)
			descLabel.TextStyle = fyne.TextStyle{Italic: true}
			descLabel.Importance = widget.LowImportance
			descLabel.Wrapping = fyne.TextWrapWord

			// Wrap the card contents more fully with value + description
			bg := canvas.NewRectangle(ColorBgCard)
			fullCard := container.NewStack(bg, container.NewPadded(container.NewVBox(
				container.NewHBox(check, TypeBadge(varData.Type), func() fyne.CanvasObject {
					if warning != "" {
						w := canvas.NewText("  "+warning, ColorWarning)
						w.TextSize = 11
						return w
					}
					return widget.NewLabel("")
				}()),
				valueEntry,
				descLabel,
			)))
			_ = card // replaced with fullCard above
			listContainer.Add(fullCard)
		}

		importBtn.Enable()
		selectAllBtn.Enable()
		deselectAllBtn.Enable()
		listContainer.Refresh()
	}

	loadFile := func(filePath string) {
		vars, err := appStorage.LoadExternalFile(filePath)
		if err != nil {
			dialog.ShowError(err, ctrl.Window)
			return
		}
		if len(vars) == 0 {
			dialog.ShowInformation("Empty File", "No variables found in the selected file.", ctrl.Window)
			return
		}
		loadedVars = vars
		fileLabel.Text = fmt.Sprintf("%s  \u2014  %d variables found", filepath.Base(filePath), len(vars))
		fileLabel.Color = ColorTextPrimary
		fileLabel.Refresh()
		buildList()
	}

	browseBtn := widget.NewButtonWithIcon("Browse...", theme.FolderOpenIcon(), func() {
		fd := dialog.NewFileOpen(func(reader fyne.URIReadCloser, err error) {
			if err != nil || reader == nil {
				return
			}
			reader.Close()
			loadFile(reader.URI().Path())
		}, ctrl.Window)
		fd.SetFilter(storage.NewExtensionFileFilter([]string{".json"}))
		fd.Show()
	})
	browseBtn.Importance = widget.HighImportance

	ctrl.Window.SetOnDropped(func(pos fyne.Position, uris []fyne.URI) {
		for _, uri := range uris {
			if strings.HasSuffix(strings.ToLower(uri.Path()), ".json") {
				loadFile(uri.Path())
				return
			}
		}
		dialog.ShowInformation("Invalid File", "Please drop a .json file.", ctrl.Window)
	})

	selectAllBtn.OnTapped = func() {
		for _, cb := range checkboxes {
			cb.SetChecked(true)
		}
	}
	deselectAllBtn.OnTapped = func() {
		for _, cb := range checkboxes {
			cb.SetChecked(false)
		}
	}

	importBtn.OnTapped = func() {
		selected := make(map[string]appStorage.Variable)
		for name, cb := range checkboxes {
			if cb.Checked {
				v := loadedVars[name]
				if entry, ok := editedValues[name]; ok {
					v.Value = entry.Text
				}
				selected[name] = v
			}
		}
		if len(selected) == 0 {
			dialog.ShowInformation("Nothing Selected", "Select at least one variable to import.", ctrl.Window)
			return
		}
		summary, err := ctrl.Storage.ImportSelectedVariables(selected)
		if err != nil {
			dialog.ShowError(err, ctrl.Window)
			return
		}
		msg := fmt.Sprintf("Added: %d\nUpdated: %d", len(summary.Added), len(summary.Updated))
		dialog.ShowInformation("Import Complete", msg, ctrl.Window)
		ctrl.Window.SetOnDropped(nil)
		ctrl.ShowStatus(fmt.Sprintf("Imported %d variables", len(selected)))
		ctrl.ShowListView()
	}

	dropHint := MutedLabel("Or drag and drop a .json template file here")
	dropHint.Alignment = fyne.TextAlignCenter

	header := container.NewVBox(
		PageHeader(ctrl, "Import Variables"),
		container.NewBorder(nil, nil, browseBtn, nil, fileLabel),
		container.NewCenter(dropHint),
		container.NewHBox(selectAllBtn, deselectAllBtn),
	)

	footer := FooterBar(nil, []fyne.CanvasObject{importBtn})

	return container.NewBorder(header, footer, nil, nil, scrollable)
}
