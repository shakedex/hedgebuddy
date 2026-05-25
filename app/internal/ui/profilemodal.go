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
		BodyText:   "",
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
