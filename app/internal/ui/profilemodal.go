package ui

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"
	"github.com/ncruces/zenity"

	"app/internal/profile"
	"app/internal/ui/components"
)

// ProfileModalMode selects which form variant ShowProfileFormModal renders.
type ProfileModalMode int

const (
	ProfileModalModeNew ProfileModalMode = iota
	ProfileModalModeEdit
	ProfileModalModeDuplicate
	ProfileModalModeImport
)

// ShowProfileFormModal opens the unified profile create/edit/duplicate/import modal.
// `target` is empty for New, or the profile name for other modes.
func ShowProfileFormModal(c *AppController, mode ProfileModalMode, target string) {
	switch mode {
	case ProfileModalModeNew:
		showNewOrDuplicate(c, "", false)
	case ProfileModalModeEdit:
		showEdit(c, target)
	case ProfileModalModeDuplicate:
		showNewOrDuplicate(c, target, true)
	case ProfileModalModeImport:
		showImportAsProfile(c)
	}
}

func showNewOrDuplicate(c *AppController, source string, isDuplicate bool) {
	title := "New profile"
	confirmLabel := "Create"
	if isDuplicate {
		title = "Duplicate profile"
		confirmLabel = "Duplicate"
	}

	nameEntry := widget.NewEntry()
	nameEntry.SetPlaceHolder("Profile name (e.g. client-alpha)")
	if isDuplicate {
		nameEntry.SetText(source + "-copy")
	}

	descEntry := widget.NewEntry()
	descEntry.SetPlaceHolder("Description (optional)")

	form := container.NewVBox(
		widget.NewLabel("Name"),
		nameEntry,
		widget.NewLabel("Description"),
		descEntry,
	)

	cancelBtn := widget.NewButton("Cancel", nil)
	confirmBtn := widget.NewButton(confirmLabel, nil)
	confirmBtn.Importance = widget.HighImportance

	d := components.ShowCustomModal(c.Window, title, form, []fyne.CanvasObject{
		layout.NewSpacer(), cancelBtn, confirmBtn,
	})

	cancelBtn.OnTapped = func() { d.Hide() }

	confirmBtn.OnTapped = func() {
		name := nameEntry.Text
		if name == "" {
			dialog.ShowError(fmt.Errorf("profile name is required"), c.Window)
			return
		}
		var err error
		if isDuplicate {
			err = profile.DuplicateProfile(c.ProfileIndex, source, name)
		} else {
			err = profile.CreateProfile(c.ProfileIndex, name, descEntry.Text)
		}
		if err != nil {
			dialog.ShowError(err, c.Window)
			return
		}
		d.Hide()
		c.rebuildSidebar()
		c.renderList()
	}

	c.Window.Canvas().Focus(nameEntry)
}

func showEdit(c *AppController, name string) {
	meta := c.ProfileIndex.Profiles[name]

	descEntry := widget.NewEntry()
	descEntry.SetText(meta.Description)

	var nameEntry *widget.Entry
	var formItems []fyne.CanvasObject
	if name != "default" {
		nameEntry = widget.NewEntry()
		nameEntry.SetText(name)
		formItems = []fyne.CanvasObject{
			widget.NewLabel("Name"),
			nameEntry,
			widget.NewLabel("Description"),
			descEntry,
		}
	} else {
		hint := widget.NewLabel("The default profile cannot be renamed.")
		hint.Importance = widget.LowImportance
		formItems = []fyne.CanvasObject{
			hint,
			widget.NewLabel("Description"),
			descEntry,
		}
	}
	form := container.NewVBox(formItems...)

	cancelBtn := widget.NewButton("Cancel", nil)
	saveBtn := widget.NewButton("Save", nil)
	saveBtn.Importance = widget.HighImportance

	d := components.ShowCustomModal(c.Window, "Edit profile", form, []fyne.CanvasObject{
		layout.NewSpacer(), cancelBtn, saveBtn,
	})

	cancelBtn.OnTapped = func() { d.Hide() }
	saveBtn.OnTapped = func() {
		if err := profile.UpdateDescription(c.ProfileIndex, name, descEntry.Text); err != nil {
			dialog.ShowError(err, c.Window)
			return
		}
		if nameEntry != nil && nameEntry.Text != name {
			if err := profile.RenameProfile(c.ProfileIndex, name, nameEntry.Text); err != nil {
				dialog.ShowError(err, c.Window)
				return
			}
			c.updateWindowTitle()
		}
		d.Hide()
		c.rebuildSidebar()
		c.renderList()
	}
}

func showImportAsProfile(c *AppController) {
	path, err := zenity.SelectFile(
		zenity.Title("Select JSON template for new profile"),
		zenity.FileFilters{{Name: "JSON files", Patterns: []string{"*.json"}}},
	)
	if err != nil {
		return
	}

	nameEntry := widget.NewEntry()
	nameEntry.SetPlaceHolder("Profile name (e.g. client-beta)")
	descEntry := widget.NewEntry()
	descEntry.SetPlaceHolder("Description (optional)")

	pathLabel := widget.NewLabel("Importing from: " + path)
	pathLabel.Importance = widget.LowImportance

	form := container.NewVBox(
		pathLabel,
		widget.NewLabel("Profile name"),
		nameEntry,
		widget.NewLabel("Description"),
		descEntry,
	)

	cancelBtn := widget.NewButton("Cancel", nil)
	importBtn := widget.NewButton("Import", nil)
	importBtn.Importance = widget.HighImportance

	d := components.ShowCustomModal(c.Window, "Import as profile", form, []fyne.CanvasObject{
		layout.NewSpacer(), cancelBtn, importBtn,
	})

	cancelBtn.OnTapped = func() { d.Hide() }
	importBtn.OnTapped = func() {
		name := nameEntry.Text
		if name == "" {
			dialog.ShowError(fmt.Errorf("profile name is required"), c.Window)
			return
		}
		if err := profile.ImportAsProfile(c.ProfileIndex, name, descEntry.Text, path); err != nil {
			dialog.ShowError(err, c.Window)
			return
		}
		d.Hide()
		c.rebuildSidebar()
		c.renderList()
	}
}

// confirmDeleteProfile shows the redesigned delete-confirm modal for a profile.
func confirmDeleteProfile(c *AppController, name string) {
	if name == "default" {
		dialog.ShowInformation("Cannot delete", "The default profile cannot be deleted.", c.Window)
		return
	}
	if name == c.ProfileIndex.Active {
		dialog.ShowInformation("Cannot delete", "Switch to another profile before deleting this one.", c.Window)
		return
	}
	components.ShowDeleteConfirm(components.DeleteConfirmOptions{
		TargetName: name,
		BodyText:   "This will permanently delete the profile and all variables it contains.",
		OnConfirm: func() {
			if err := profile.DeleteProfile(c.ProfileIndex, name); err != nil {
				dialog.ShowError(err, c.Window)
				return
			}
			c.rebuildSidebar()
			c.renderList()
		},
		Parent: c.Window,
	})
}
