package ui

import (
	"fmt"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	"app/internal/storage"
)

// NewListView creates the main variable list view.
func NewListView(ctrl *AppController) fyne.CanvasObject {
	keys := ctrl.Storage.GetSortedKeys()
	filteredKeys := make([]string, len(keys))
	copy(filteredKeys, keys)

	revealed := make(map[string]bool)

	countLabel := MutedLabel(variableCountText(len(filteredKeys), len(keys)))

	searchEntry := widget.NewEntry()
	searchEntry.SetPlaceHolder("Search variables...")

	list := widget.NewList(
		func() int { return len(filteredKeys) },
		func() fyne.CanvasObject { return createVariableCardTemplate() },
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			if id >= len(filteredKeys) {
				return
			}
			name := filteredKeys[id]
			v, ok := ctrl.Storage.GetVariable(name)
			if !ok {
				return
			}
			updateVariableCard(obj, name, v, revealed[name], ctrl, &revealed, func() {
				searchEntry.OnChanged(searchEntry.Text)
			})
		},
	)

	searchEntry.OnChanged = func(query string) {
		keys = ctrl.Storage.GetSortedKeys()
		if query == "" {
			filteredKeys = make([]string, len(keys))
			copy(filteredKeys, keys)
		} else {
			q := strings.ToLower(query)
			filteredKeys = filteredKeys[:0]
			for _, k := range keys {
				v, _ := ctrl.Storage.GetVariable(k)
				if strings.Contains(strings.ToLower(k), q) ||
					strings.Contains(strings.ToLower(v.Value), q) ||
					strings.Contains(strings.ToLower(v.Description), q) ||
					strings.Contains(strings.ToLower(v.Type), q) {
					filteredKeys = append(filteredKeys, k)
				}
			}
		}
		countLabel.Text = variableCountText(len(filteredKeys), len(keys))
		countLabel.Refresh()
		list.Refresh()
	}

	// --- Build structured header ---
	header := buildListHeader(ctrl, searchEntry, countLabel)

	if len(keys) == 0 {
		addBtn := widget.NewButtonWithIcon("Add Variable", theme.ContentAddIcon(), func() {
			ctrl.ShowFormView("", "", "", TypeString, "")
		})
		addBtn.Importance = widget.HighImportance

		importBtn := widget.NewButtonWithIcon("Import Template", theme.FolderOpenIcon(), func() {
			ctrl.ShowImportView()
		})

		return container.NewBorder(header, nil, nil, nil,
			EmptyState("No variables configured yet",
				"Add your first variable or import a template to get started.",
				addBtn, importBtn),
		)
	}

	return container.NewBorder(header, nil, nil, nil, list)
}

// buildListHeader creates the structured multi-row header for the list view.
func buildListHeader(ctrl *AppController, searchEntry *widget.Entry, countLabel *canvas.Text) fyne.CanvasObject {
	// Row 1: Logo + title | status text + utility buttons
	logo := canvas.NewImageFromResource(AppIcon())
	logo.FillMode = canvas.ImageFillContain
	logo.SetMinSize(fyne.NewSize(28, 28))

	titleText := canvas.NewText(AppName, ColorAccentBlue)
	titleText.TextSize = 20
	titleText.TextStyle = fyne.TextStyle{Bold: true}

	refreshBtn := widget.NewButtonWithIcon("", theme.ViewRefreshIcon(), func() {
		if err := ctrl.Reload(); err != nil {
			ctrl.ShowStatus("Failed to reload: " + err.Error())
			return
		}
		ctrl.ShowStatus("Variables reloaded")
		ctrl.ShowListView()
	})
	folderBtn := widget.NewButtonWithIcon("", theme.FolderIcon(), func() {
		ctrl.OpenStorageFolder()
	})
	aboutBtn := widget.NewButtonWithIcon("", theme.InfoIcon(), func() {
		ctrl.ShowAboutView()
	})

	rightSide := container.NewVBox(
		container.NewHBox(layout.NewSpacer(), refreshBtn, folderBtn, aboutBtn),
		container.NewHBox(layout.NewSpacer(), ctrl.StatusText),
	)

	leftSide := container.NewVBox(
		container.NewHBox(logo, titleText),
	)

	brandRow := container.NewBorder(nil, nil,
		leftSide,
		rightSide,
	)

	// Row 2: Action buttons
	addBtn := widget.NewButtonWithIcon("New", theme.ContentAddIcon(), func() {
		ctrl.ShowFormView("", "", "", TypeString, "")
	})
	addBtn.Importance = widget.HighImportance

	importBtn := widget.NewButtonWithIcon("Import", theme.FolderOpenIcon(), func() {
		ctrl.ShowImportView()
	})
	exportBtn := widget.NewButtonWithIcon("Export", theme.DocumentSaveIcon(), func() {
		ctrl.ShowExportView()
	})

	actionRow := container.NewHBox(addBtn, importBtn, exportBtn)

	// Row 3: Search + count
	searchRow := container.NewBorder(nil, nil, nil, nil, searchEntry)

	return container.NewVBox(
		brandRow,
		actionRow,
		searchRow,
		countLabel,
	)
}

// createVariableCardTemplate creates the reusable template for each list item
func createVariableCardTemplate() fyne.CanvasObject {
	nameLabel := canvas.NewText("VARIABLE_NAME", ColorTextPrimary)
	nameLabel.TextSize = 15
	nameLabel.TextStyle = fyne.TextStyle{Bold: true}

	typeBadge := canvas.NewText("[string]", ColorTextMuted)
	typeBadge.TextSize = 11
	typeBadge.TextStyle = fyne.TextStyle{Bold: true}

	valueLabel := canvas.NewText("value", ColorTextSecond)
	valueLabel.TextSize = 13
	valueLabel.TextStyle = fyne.TextStyle{Monospace: true}

	descLabel := canvas.NewText("", ColorTextMuted)
	descLabel.TextSize = 12
	descLabel.TextStyle = fyne.TextStyle{Italic: true}

	// Distinct icons: copy, reveal, edit, duplicate, delete
	copyBtn := widget.NewButtonWithIcon("", theme.ContentCopyIcon(), nil)
	revealBtn := widget.NewButtonWithIcon("", theme.VisibilityIcon(), nil)
	editBtn := widget.NewButtonWithIcon("", theme.DocumentCreateIcon(), nil)
	dupeBtn := widget.NewButtonWithIcon("", theme.ContentAddIcon(), nil)
	deleteBtn := widget.NewButtonWithIcon("", theme.DeleteIcon(), nil)
	deleteBtn.Importance = widget.DangerImportance

	topRow := container.NewHBox(nameLabel, typeBadge, layout.NewSpacer(), copyBtn, revealBtn, editBtn, dupeBtn, deleteBtn)
	infoCol := container.NewVBox(topRow, valueLabel, descLabel)

	// Type-colored accent bar on left (wider for visual impact)
	accent := canvas.NewRectangle(ColorAccentBlue)
	accent.SetMinSize(fyne.NewSize(4, 0))

	card := container.NewBorder(nil, nil, accent, nil, container.NewPadded(infoCol))
	bg := canvas.NewRectangle(ColorBgCard)
	return container.NewStack(bg, card)
}

// updateVariableCard populates a card template with actual data
func updateVariableCard(obj fyne.CanvasObject, name string, v storage.Variable, isRevealed bool, ctrl *AppController, revealed *map[string]bool, refresh func()) {
	stackContainer := obj.(*fyne.Container)
	borderContainer := stackContainer.Objects[1].(*fyne.Container)

	// Access the accent bar (left element of border)
	accent := borderContainer.Objects[1].(*canvas.Rectangle)
	accent.FillColor = TypeColor(v.Type)
	accent.Refresh()

	paddedInfoCol := borderContainer.Objects[0].(*fyne.Container)
	infoCol := paddedInfoCol.Objects[0].(*fyne.Container)
	topRow := infoCol.Objects[0].(*fyne.Container)

	nameLabel := topRow.Objects[0].(*canvas.Text)
	typeBadge := topRow.Objects[1].(*canvas.Text)
	copyBtn := topRow.Objects[3].(*widget.Button)
	revealBtn := topRow.Objects[4].(*widget.Button)
	editBtn := topRow.Objects[5].(*widget.Button)
	dupeBtn := topRow.Objects[6].(*widget.Button)
	deleteBtn := topRow.Objects[7].(*widget.Button)
	valueLabel := infoCol.Objects[1].(*canvas.Text)
	descLabel := infoCol.Objects[2].(*canvas.Text)

	nameLabel.Text = name
	nameLabel.Refresh()

	typeBadge.Text = fmt.Sprintf("[%s]", v.Type)
	typeBadge.Color = TypeColor(v.Type)
	typeBadge.Refresh()

	if v.Type == TypeSecret && !isRevealed {
		valueLabel.Text = SecretMask
	} else {
		displayVal := v.Value
		if len(displayVal) > ValueTruncateLen {
			displayVal = displayVal[:ValueTruncateLen-3] + "..."
		}
		valueLabel.Text = displayVal
	}
	valueLabel.Refresh()

	descLabel.Text = v.Description
	descLabel.Refresh()

	// Show/hide reveal button based on type
	if v.Type == TypeSecret {
		revealBtn.Show()
		if isRevealed {
			revealBtn.SetIcon(theme.VisibilityOffIcon())
		} else {
			revealBtn.SetIcon(theme.VisibilityIcon())
		}
	} else {
		revealBtn.Hide()
	}

	copyBtn.OnTapped = func() {
		ctrl.Window.Clipboard().SetContent(v.Value)
		ctrl.ShowStatus(fmt.Sprintf("Copied '%s' to clipboard", name))
	}

	revealBtn.OnTapped = func() {
		(*revealed)[name] = !(*revealed)[name]
		refresh()
	}

	editBtn.OnTapped = func() {
		ctrl.ShowFormView(name, name, v.Value, v.Type, v.Description)
	}

	dupeBtn.OnTapped = func() {
		ctrl.DuplicateVariable(name)
	}

	deleteBtn.OnTapped = func() {
		ctrl.ConfirmDelete(name)
	}
}

func variableCountText(shown, total int) string {
	if shown == total {
		return fmt.Sprintf("%d variables", total)
	}
	return fmt.Sprintf("%d of %d variables", shown, total)
}
