package ui

import (
	"errors"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	"github.com/ncruces/zenity"

	"app/internal/storage"
	"app/internal/ui/components"
	"app/internal/ui/icons"
	"app/internal/ui/tokens"
	"app/internal/validator"
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
	nameEntry.Validator = func(s string) error {
		if s == "" {
			return nil // don't show "required" until they try to save
		}
		return validator.ValidateVariableName(s)
	}

	typeRadio := widget.NewRadioGroup([]string{"String", "Path", "URL", "Secret"}, nil)
	typeRadio.Horizontal = true
	typeRadio.SetSelected(typeToLabel(prefill.Type))

	valueEntry := widget.NewEntry()
	valueEntry.SetPlaceHolder("Variable value")
	valueEntry.SetText(prefill.Value)
	valueEntry.Validator = func(s string) error {
		if s == "" {
			return nil // empty is OK until save
		}
		return validator.ValidateByType(labelToType(typeRadio.Selected), s)
	}

	secretEntry := widget.NewPasswordEntry()
	secretEntry.SetPlaceHolder("Secret value")
	secretEntry.SetText(prefill.Value)
	secretEntry.Validator = func(s string) error {
		if s == "" {
			return nil
		}
		return validator.ValidateByType("secret", s)
	}

	browseFileBtn := widget.NewButtonWithIcon("File…", icons.File, func() {
		path, err := zenity.SelectFile(zenity.Title("Select file"))
		if err == nil {
			valueEntry.SetText(path)
		}
	})
	browseFolderBtn := widget.NewButtonWithIcon("Folder…", icons.FolderOpen, func() {
		path, err := zenity.SelectFile(zenity.Title("Select folder"), zenity.Directory())
		if err == nil {
			valueEntry.SetText(path)
		}
	})

	valueContainer := container.NewStack(valueEntry)
	browseContainer := container.NewHBox(browseFileBtn, browseFolderBtn)
	browseContainer.Hide()

	descEntry := widget.NewEntry()
	descEntry.SetPlaceHolder("Optional description")
	descEntry.SetText(prefill.Description)

	nameField := components.NewFieldRow("Name", nameEntry, nil)
	// valueField/descField: we use the FieldRow visual but compose manually because the value field has type-dependent content.
	descField := components.NewFieldRow("Description", descEntry, nil)

	// Inline error caption for the (type-dependent) value field. We can't use a
	// FieldRow here because the visible widget swaps when the user changes type.
	valueErrText := canvas.NewText("", tokens.Danger)
	valueErrText.TextSize = 11
	valueErrText.Hide()
	setValueErr := func(msg string) {
		if msg == "" {
			valueErrText.Hide()
			return
		}
		valueErrText.Text = msg
		valueErrText.Show()
		valueErrText.Refresh()
	}

	// Wire inline validation. Name is straightforward.
	nameEntry.SetOnValidationChanged(func(err error) {
		if err == nil {
			nameField.SetError("")
			return
		}
		nameField.SetError(err.Error())
	})
	// For value, the active entry depends on the selected type. Each entry
	// only publishes errors when it's the visible one.
	valueEntry.SetOnValidationChanged(func(err error) {
		if labelToType(typeRadio.Selected) == "secret" {
			return // not visible — ignore
		}
		if err == nil {
			setValueErr("")
			return
		}
		setValueErr(err.Error())
	})
	secretEntry.SetOnValidationChanged(func(err error) {
		if labelToType(typeRadio.Selected) != "secret" {
			return
		}
		if err == nil {
			setValueErr("")
			return
		}
		setValueErr(err.Error())
	})

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
		// Re-run validation on the newly active entry so the inline error
		// reflects the current value under the new type's rules.
		setValueErr("")
		if t == "secret" {
			if err := secretEntry.Validate(); err != nil {
				setValueErr(err.Error())
			}
		} else {
			if err := valueEntry.Validate(); err != nil {
				setValueErr(err.Error())
			}
		}
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
		valueErrText,
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

		// Inline pre-validation: if the user hasn't fixed (or never touched) the
		// required fields, surface the error under the offending row instead of
		// a modal popup.
		if err := validator.ValidateVariableName(name); err != nil {
			nameField.SetError(err.Error())
			saveBtn.SetState(components.StateError)
			return
		}
		if err := validator.ValidateByType(varType, value); err != nil {
			setValueErr(err.Error())
			saveBtn.SetState(components.StateError)
			return
		}

		if err := c.SaveVariable(oldName, name, value, varType, descEntry.Text); err != nil {
			// If it's a collision (rename or new conflicting with existing),
			// surface inline under the Name field rather than a modal.
			var dupErr *storage.DuplicateKeyError
			if errors.Is(err, ErrVariableExists) || errors.As(err, &dupErr) {
				nameField.SetError(err.Error())
				saveBtn.SetState(components.StateError)
				return
			}
			// Otherwise it's a real disk/IO error — modal as last resort.
			saveBtn.SetState(components.StateError)
			dialog.ShowError(err, c.Window)
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

	footer := components.DrawerFooter(
		[]fyne.CanvasObject{cancelBtn},
		[]fyne.CanvasObject{saveBtn.Button},
	)

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
