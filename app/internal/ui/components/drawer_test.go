package components

import (
	"testing"

	"fyne.io/fyne/v2/test"
	"fyne.io/fyne/v2/widget"
)

func TestDrawer_OpenCloseTogglesVisibility(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	d := NewDrawer()
	w := test.NewWindow(d)
	defer w.Close()

	if d.IsOpen() {
		t.Fatal("drawer should start closed")
	}

	d.Open("Test", widget.NewLabel("body"), nil)
	if !d.IsOpen() {
		t.Error("drawer should be open after Open()")
	}

	closed := false
	d.Open("Test2", widget.NewLabel("body"), func() { closed = true })
	d.Close()
	if d.IsOpen() {
		t.Error("drawer should be closed after Close()")
	}
	if !closed {
		t.Error("onClose callback should fire")
	}
}
