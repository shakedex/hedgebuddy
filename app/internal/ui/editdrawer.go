package ui

import (
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	"github.com/ncruces/zenity"

	"app/internal/storage"
	"app/internal/ui/components"
	"app/internal/ui/icons"
)

// ShowEditDrawer opens the edit drawer. If editingName is empty, treats as New Variable.
func ShowEditDrawer(c *AppController, editingName string) {
	isEditing := editingName != ""
	title := "New variable"
	if isEditing {
		title = "Edit variable"
	}

	var prefill storage.Variable
	if isEditing {
		prefill, _ = c.Storage.GetVariable(editingName)
	} else {
		prefill = storage.Variable{Type: "string"}
	}

	nameEntry := widget.NewEntry()
	nameEntry.SetPlaceHolder("VARIABLE_NAME")
	nameEntry.SetText(editingName)

	typeRadio := widget.NewRadioGroup([]string{"String", "Path", "URL", "Secret"}, nil)
	typeRadio.Horizontal = true
	typeRadio.SetSelected(typeToLabel(prefill.Type))

	valueEntry := widget.NewEntry()
	valueEntry.SetPlaceHolder("Variable value")
	valueEntry.SetText(prefill.Value)

	secretEntry := widget.NewPasswordEntry()
	secretEntry.SetPlaceHolder("Secret value")
	secretEntry.SetText(prefill.Value)

	browseBtn := widget.NewButtonWithIcon("Folder…", icons.FolderOpen, func() {
		path, err := zenity.SelectFile(zenity.Title("Select folder"), zenity.Directory())
		if err == nil {
			valueEntry.SetText(path)
		}
	})

	valueContainer := container.NewStack(valueEntry)
	browseContainer := container.NewHBox(browseBtn)
	browseContainer.Hide()

	descEntry := widget.NewEntry()
	descEntry.SetPlaceHolder("Optional description")
	descEntry.SetText(prefill.Description)

	nameField := components.NewFieldRow("Name", nameEntry, nil)
	// valueField/descField: we use the FieldRow visual but compose manually because the value field has type-dependent content.
	descField := components.NewFieldRow("Description", descEntry, nil)

	applyType := func(label string) {
		t := labelToType(label)
		switch t {
		case "path":
			valueContainer.Objects = []fyne.CanvasObject{valueEntry}
			browseContainer.Show()
		case "secret":
			valueContainer.Objects = []fyne.CanvasObject{secretEntry}
			browseContainer.Hide()
		default:
			valueContainer.Objects = []fyne.CanvasObject{valueEntry}
			browseContainer.Hide()
		}
		valueContainer.Refresh()
	}

	typeRadio.OnChanged = func(label string) { applyType(label) }
	applyType(typeRadio.Selected)

	form := container.NewVBox(
		nameField.Object(),
		widget.NewSeparator(),
		fieldLabel("Type"),
		typeRadio,
		widget.NewSeparator(),
		fieldLabel("Value"),
		valueContainer,
		browseContainer,
		widget.NewSeparator(),
		descField.Object(),
	)

	cancelBtn := widget.NewButton("Cancel", func() { c.CloseDrawer() })

	saveBtn := components.NewInlineStateButton("Save", "Saved", "Save failed", nil)
	saveBtn.Button.OnTapped = func() {
		saveBtn.SetState(components.StateBusy)

		name := nameEntry.Text
		varType := labelToType(typeRadio.Selected)
		var value string
		if varType == "secret" {
			value = secretEntry.Text
		} else {
			value = valueEntry.Text
		}

		oldName := ""
		if isEditing {
			oldName = editingName
		}

		if err := c.SaveVariable(oldName, name, value, varType, descEntry.Text); err != nil {
			saveBtn.SetState(components.StateError)
			dialog.ShowError(err, c.Window) // Phase 2 replaces this with inline validation
			return
		}

		saveBtn.SetState(components.StateDone)
		c.FlashRow(name)
		c.rebuildSidebar()
		c.renderList()
		// Hold briefly so the user sees "✓ Saved" before the drawer closes.
		go func() {
			time.Sleep(600 * time.Millisecond)
			fyne.Do(func() { c.CloseDrawer() })
		}()
	}

	footer := container.NewBorder(nil, nil, cancelBtn, saveBtn.Button)

	body := container.NewBorder(nil, footer, nil, nil, container.NewVScroll(container.NewPadded(form)))

	c.OpenDrawer(title, body, nil)
}

func fieldLabel(text string) fyne.CanvasObject {
	l := widget.NewLabel(text)
	l.TextStyle = fyne.TextStyle{Bold: true}
	return l
}

func typeToLabel(t string) string {
	switch t {
	case "path":
		return "Path"
	case "url":
		return "URL"
	case "secret":
		return "Secret"
	default:
		return "String"
	}
}

func labelToType(l string) string {
	switch l {
	case "Path":
		return "path"
	case "URL":
		return "url"
	case "Secret":
		return "secret"
	default:
		return "string"
	}
}
