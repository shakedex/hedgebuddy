package components

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"
)

// DeleteConfirmOptions configures a redesigned delete confirmation modal.
type DeleteConfirmOptions struct {
	TargetName string // shown in the title and the confirm button
	BodyText   string // wrapping label describing the consequence
	OnConfirm  func()
	Parent     fyne.Window
}

// ShowDeleteConfirm renders a centered confirmation modal with:
//
//	Title: "Delete <Name>?"
//	Body: <BodyText> (wraps via widget.Label)
//	Buttons: Cancel (ghost) · Delete <Name> (Danger)
func ShowDeleteConfirm(opts DeleteConfirmOptions) {
	var content fyne.CanvasObject
	if opts.BodyText != "" {
		body := widget.NewLabel(opts.BodyText)
		body.Wrapping = fyne.TextWrapWord
		content = container.NewPadded(body)
	} else {
		// Empty body — title + buttons carry the meaning. No filler text.
		content = container.NewPadded(widget.NewLabel(""))
	}

	d := dialog.NewCustomWithoutButtons(
		"Delete "+opts.TargetName+"?",
		content,
		opts.Parent,
	)

	cancelBtn := widget.NewButton("Cancel", func() { d.Hide() })

	confirmBtn := widget.NewButton("Delete "+opts.TargetName, func() {
		d.Hide()
		if opts.OnConfirm != nil {
			opts.OnConfirm()
		}
	})
	confirmBtn.Importance = widget.DangerImportance

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), cancelBtn, confirmBtn})
	d.Show()
}

// ShowCustomModal renders a centered modal with a custom button row.
// Used by ProfileFormModal and Settings/About modals where the buttons vary.
func ShowCustomModal(parent fyne.Window, title string, body fyne.CanvasObject, buttons []fyne.CanvasObject) dialog.Dialog {
	d := dialog.NewCustomWithoutButtons(title, container.NewPadded(body), parent)
	d.SetButtons(buttons)
	d.Show()
	return d
}
