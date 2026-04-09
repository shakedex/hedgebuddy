package ui

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
	"github.com/ncruces/zenity"
)

// NewFormView creates the add/edit variable form
func NewFormView(ctrl *AppController, editingName string, prefillName, prefillValue, prefillType, prefillDesc string) fyne.CanvasObject {
	isEditing := editingName != ""

	titleText := "New Variable"
	if isEditing {
		titleText = "Edit Variable"
	}

	header := PageHeader(ctrl, titleText)

	// Name field
	nameEntry := widget.NewEntry()
	nameEntry.SetPlaceHolder("VARIABLE_NAME")
	nameEntry.SetText(prefillName)

	// Type selector
	typeRadio := widget.NewRadioGroup(AllTypes(), nil)
	typeRadio.Horizontal = true
	if prefillType != "" {
		typeRadio.SetSelected(prefillType)
	} else {
		typeRadio.SetSelected("string")
	}

	// Value field
	valueEntry := widget.NewEntry()
	valueEntry.SetPlaceHolder("Variable value")
	valueEntry.SetText(prefillValue)

	secretEntry := widget.NewPasswordEntry()
	secretEntry.SetPlaceHolder("Secret value")
	secretEntry.SetText(prefillValue)

	// Browse button for path type — uses native OS file dialog
	browseBtn := widget.NewButtonWithIcon("Browse...", theme.FolderOpenIcon(), func() {
		path, err := zenity.SelectFile(
			zenity.Title("Select file or folder"),
			zenity.Directory(),
		)
		if err != nil {
			return
		}
		valueEntry.SetText(path)
	})

	// Hint label
	hintLabel := MutedLabel("")

	// Value container that swaps between normal and secret entry
	valueContainer := container.NewStack(valueEntry)
	browseContainer := container.NewHBox(browseBtn)
	browseContainer.Hide()

	updateTypeUI := func(varType string) {
		switch varType {
		case TypePath:
			valueContainer.Objects = []fyne.CanvasObject{valueEntry}
			browseContainer.Show()
			hintLabel.Text = "Enter a file or directory path. Must exist on this machine."
		case TypeURL:
			valueContainer.Objects = []fyne.CanvasObject{valueEntry}
			browseContainer.Hide()
			hintLabel.Text = "Enter a URL with http:// or https:// scheme."
		case TypeSecret:
			valueContainer.Objects = []fyne.CanvasObject{secretEntry}
			browseContainer.Hide()
			hintLabel.Text = "Value will be masked in the variable list."
		default:
			valueContainer.Objects = []fyne.CanvasObject{valueEntry}
			browseContainer.Hide()
			hintLabel.Text = ""
		}
		valueContainer.Refresh()
		hintLabel.Refresh()
	}

	typeRadio.OnChanged = func(selected string) {
		if selected == TypeSecret {
			secretEntry.SetText(valueEntry.Text)
		} else {
			currentSecret := secretEntry.Text
			if currentSecret != "" && valueEntry.Text == "" {
				valueEntry.SetText(currentSecret)
			}
		}
		updateTypeUI(selected)
	}

	updateTypeUI(typeRadio.Selected)

	// Description field
	descHint := MutedLabel("Optional")

	descEntry := widget.NewEntry()
	descEntry.SetPlaceHolder("What this variable is for...")
	descEntry.SetText(prefillDesc)

	// Form layout with section labels from helpers
	form := container.NewVBox(
		SectionLabel("Variable Name"),
		nameEntry,
		widget.NewSeparator(),
		SectionLabel("Type"),
		typeRadio,
		widget.NewSeparator(),
		SectionLabel("Value"),
		valueContainer,
		browseContainer,
		hintLabel,
		widget.NewSeparator(),
		container.NewHBox(SectionLabel("Description"), descHint),
		descEntry,
	)

	// Save handler
	saveBtn := widget.NewButtonWithIcon("Save", theme.DocumentSaveIcon(), func() {
		name := nameEntry.Text
		varType := typeRadio.Selected

		var value string
		if varType == TypeSecret {
			value = secretEntry.Text
		} else {
			value = valueEntry.Text
		}

		oldName := ""
		if isEditing {
			oldName = editingName
		}
		if err := ctrl.SaveVariable(oldName, name, value, varType, descEntry.Text); err != nil {
			dialog.ShowError(err, ctrl.Window)
			return
		}

		action := "added"
		if isEditing {
			action = "updated"
		}
		ctrl.ShowStatus(fmt.Sprintf("Variable '%s' %s", name, action))
		ctrl.ShowListView()
	})
	saveBtn.Importance = widget.HighImportance

	cancelBtn := widget.NewButtonWithIcon("Cancel", theme.NavigateBackIcon(), func() {
		ctrl.ShowListView()
	})

	footer := FooterBar([]fyne.CanvasObject{cancelBtn}, []fyne.CanvasObject{saveBtn})

	scrollable := container.NewVScroll(container.NewPadded(form))

	return container.NewBorder(header, footer, nil, nil, scrollable)
}
