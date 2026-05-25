package ui

import (
	"fmt"
	"image/color"
	"path/filepath"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	"github.com/ncruces/zenity"

	appStorage "app/internal/storage"
	"app/internal/ui/components"
	"app/internal/ui/icons"
	"app/internal/ui/tokens"
)

// ShowImportDrawer opens the import drawer. Drop handler is wired on open and cleared on close.
func ShowImportDrawer(c *AppController) {
	fileLabel := canvas.NewText("No file selected", tokens.TextMuted)
	fileLabel.TextSize = 13

	var loaded map[string]appStorage.Variable
	checkboxes := make(map[string]*widget.Check)
	valueEntries := make(map[string]*widget.Entry)

	listBox := container.NewVBox()
	scrollableList := container.NewVScroll(listBox)

	emptyHint := widget.NewLabel("Select a JSON template to preview its contents.")
	emptyHint.Alignment = fyne.TextAlignCenter
	emptyHint.Importance = widget.LowImportance

	contentArea := container.NewStack(emptyHint)

	importBtn := components.NewInlineStateButton("Import 0 selected", "Imported", "Import failed", nil)
	importBtn.Button.Disable()

	updateImportLabel := func() {
		n := 0
		for _, cb := range checkboxes {
			if cb.Checked {
				n++
			}
		}
		importBtn.Button.SetText(fmt.Sprintf("Import %d selected", n))
		if n == 0 {
			importBtn.Button.Disable()
		} else {
			importBtn.Button.Enable()
		}
		importBtn.Button.Refresh()
	}

	buildList := func() {
		listBox.Objects = nil
		checkboxes = make(map[string]*widget.Check)
		valueEntries = make(map[string]*widget.Entry)

		for name, v := range loaded {
			n := name
			vv := v
			cb := widget.NewCheck(n, func(bool) { updateImportLabel() })
			cb.SetChecked(true)
			checkboxes[n] = cb

			ve := widget.NewEntry()
			ve.SetText(vv.Value)
			valueEntries[n] = ve

			warn := ""
			if _, exists := c.Storage.GetVariable(n); exists {
				warn = "exists — will overwrite"
			}

			rowContent := container.NewVBox(
				container.NewHBox(cb, widget.NewLabel("["+vv.Type+"]"), warningText(warn)),
				ve,
				lowLabel(vv.Description),
			)
			bg := canvas.NewRectangle(tokens.Surface2)
			bg.CornerRadius = tokens.RadiusCard
			bg.StrokeColor = tokens.BorderSubtle
			bg.StrokeWidth = 1
			cardRow := container.NewStack(bg, container.NewPadded(rowContent))

			listBox.Add(cardRow)
			listBox.Add(spacerFn(8))
		}
		listBox.Refresh()
		updateImportLabel()
		contentArea.Objects = []fyne.CanvasObject{scrollableList}
		contentArea.Refresh()
	}

	loadFile := func(path string) {
		vars, err := appStorage.LoadExternalFile(path)
		if err != nil {
			dialog.ShowError(err, c.Window)
			return
		}
		if len(vars) == 0 {
			dialog.ShowInformation("Empty file", "No variables found in the selected file.", c.Window)
			return
		}
		loaded = vars
		fileLabel.Text = fmt.Sprintf("%s — %d variables", filepath.Base(path), len(vars))
		fileLabel.Color = tokens.TextPrimary
		fileLabel.Refresh()
		buildList()
	}

	browseBtn := widget.NewButtonWithIcon("Choose file…", icons.FolderOpen, func() {
		path, err := zenity.SelectFile(
			zenity.Title("Select JSON template"),
			zenity.FileFilters{{Name: "JSON files", Patterns: []string{"*.json"}}},
		)
		if err == nil {
			loadFile(path)
		}
	})

	selectAllBtn := widget.NewButton("Select all", func() {
		for _, cb := range checkboxes {
			cb.SetChecked(true)
		}
	})
	deselectAllBtn := widget.NewButton("Deselect all", func() {
		for _, cb := range checkboxes {
			cb.SetChecked(false)
		}
	})

	cancelBtn := widget.NewButton("Cancel", func() { c.CloseDrawer() })

	importBtn.Button.OnTapped = func() {
		selected := make(map[string]appStorage.Variable)
		for name, cb := range checkboxes {
			if !cb.Checked {
				continue
			}
			v := loaded[name]
			if entry, ok := valueEntries[name]; ok {
				v.Value = entry.Text
			}
			selected[name] = v
		}
		importBtn.SetState(components.StateBusy)
		release := c.suppressFileWatchReload()
		_, err := c.Storage.ImportSelectedVariables(selected)
		release()
		if err != nil {
			importBtn.SetState(components.StateError)
			dialog.ShowError(err, c.Window)
			return
		}
		importBtn.SetState(components.StateDone)
		flashNames := make([]string, 0, len(selected))
		for name := range selected {
			flashNames = append(flashNames, name)
		}
		c.FlashRow(flashNames...)
		c.rebuildSidebar()
		c.renderList()
		c.CloseDrawer()
	}

	header := container.NewVBox(
		container.NewBorder(nil, nil, browseBtn, nil, fileLabel),
		container.NewHBox(selectAllBtn, deselectAllBtn),
	)

	footer := components.DrawerFooter(
		[]fyne.CanvasObject{cancelBtn},
		[]fyne.CanvasObject{importBtn.Button},
	)

	body := container.NewBorder(header, footer, nil, nil, contentArea)

	// Wire the drop handler ONLY while this drawer is open.
	// On drawer close (see the OpenDrawer onClose callback below), we clear it.
	c.Window.SetOnDropped(func(_ fyne.Position, uris []fyne.URI) {
		for _, u := range uris {
			if strings.HasSuffix(strings.ToLower(u.Path()), ".json") {
				loadFile(u.Path())
				return
			}
		}
		dialog.ShowInformation("Invalid file", "Please drop a .json file.", c.Window)
	})

	c.OpenDrawer("Import variables", body, func() {
		c.Window.SetOnDropped(nil)
	})
}

func warningText(s string) fyne.CanvasObject {
	if s == "" {
		return widget.NewLabel("")
	}
	t := canvas.NewText("⚠ "+s, tokens.Warning)
	t.TextSize = 11
	return t
}

func lowLabel(s string) fyne.CanvasObject {
	l := widget.NewLabel(s)
	l.Wrapping = fyne.TextWrapWord
	l.Importance = widget.LowImportance
	return l
}

// spacerFn returns a fully transparent CanvasObject with a fixed minimum
// height. Used between import-drawer card rows to separate them visually.
func spacerFn(h float32) fyne.CanvasObject {
	s := canvas.NewRectangle(color.NRGBA{})
	s.SetMinSize(fyne.NewSize(0, h))
	return s
}
