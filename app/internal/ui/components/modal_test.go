package components

import (
	"testing"

	"fyne.io/fyne/v2/test"
)

func TestShowDeleteConfirm_DoesNotPanic(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	w := test.NewWindow(nil)
	defer w.Close()

	ShowDeleteConfirm(DeleteConfirmOptions{
		TargetName: "API_KEY",
		BodyText:   "Long body text that should wrap when the modal is narrow.",
		OnConfirm:  func() {},
		Parent:     w,
	})
}
