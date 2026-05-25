package components

import (
	"testing"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/test"
)

func TestSidebarItem_RendersAndTaps(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	tapped := 0
	item := NewSidebarItem("default", nil, true, func() { tapped++ })
	w := test.NewWindow(item)
	defer w.Close()

	test.Tap(item)
	if tapped != 1 {
		t.Errorf("expected onTap called once, got %d", tapped)
	}
}

func TestSidebar_RendersSections(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	count := 3
	item := NewSidebarItem("path", &count, false, nil)
	sb := NewSidebar(
		[]SidebarSection{{Title: "FILTERS", Items: []fyne.CanvasObject{item}}},
		nil,
	)
	w := test.NewWindow(sb)
	defer w.Close()
}
