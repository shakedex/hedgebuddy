package main

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"

	"app/internal/ui"
)

func main() {
	a := app.New()
	a.Settings().SetTheme(&ui.HedgeBuddyTheme{})
	a.SetIcon(ui.AppIcon())

	w := a.NewWindow(ui.WindowTitle)
	w.SetIcon(ui.AppIcon())
	w.Resize(fyne.NewSize(ui.WindowWidth, ui.WindowHeight))
	w.CenterOnScreen()

	ctrl := ui.NewAppController(a, w)
	ctrl.ShowListView()

	go ctrl.RunPythonCheck()

	w.ShowAndRun()
}
