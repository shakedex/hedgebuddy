package ui

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/widget"
)

// showProfileRowMenu opens a context menu at the given position with Rename / Duplicate / Delete actions.
// Anchor is the canvas object the menu attaches to.
func showProfileRowMenu(c *AppController, profileName string, anchor fyne.CanvasObject) {
	menu := fyne.NewMenu("",
		fyne.NewMenuItem("Rename", func() {
			ShowProfileFormModal(c, ProfileModalModeEdit, profileName)
		}),
		fyne.NewMenuItem("Duplicate", func() {
			ShowProfileFormModal(c, ProfileModalModeDuplicate, profileName)
		}),
		fyne.NewMenuItem("Delete", func() {
			confirmDeleteProfile(c, profileName)
		}),
	)
	popup := widget.NewPopUpMenu(menu, c.Window.Canvas())
	popup.ShowAtRelativePosition(fyne.NewPos(0, 24), anchor)
}
