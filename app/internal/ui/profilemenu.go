package ui

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/widget"
)

// showProfileRowMenu opens a context menu at the given position with Rename / Duplicate / Delete actions.
// Anchor is the canvas object the menu attaches to.
func showProfileRowMenu(c *AppController, profileName string, anchor fyne.CanvasObject) {
	renameItem := fyne.NewMenuItem("Rename", func() {
		c.editingProfile = profileName
		c.rebuildSidebar()
	})
	duplicateItem := fyne.NewMenuItem("Duplicate", func() {
		c.duplicateProfileDirect(profileName)
	})
	deleteItem := fyne.NewMenuItem("Delete", func() {
		confirmDeleteProfile(c, profileName)
	})

	if profileName == "default" {
		renameItem.Disabled = true
		deleteItem.Disabled = true
	}
	if profileName == c.ProfileIndex.Active {
		deleteItem.Disabled = true
	}

	menu := fyne.NewMenu("", renameItem, duplicateItem, deleteItem)
	popup := widget.NewPopUpMenu(menu, c.Window.Canvas())
	popup.ShowAtRelativePosition(fyne.NewPos(0, 24), anchor)
}
