package main

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	fynetooltip "github.com/dweymouth/fyne-tooltip"

	"app/internal/ui"
)

func main() {
	ui.InstallLogFilter()
	a := app.New()
	regular, bold := ui.LoadOSFonts()
	a.Settings().SetTheme(ui.NewHedgeBuddyTheme(regular, bold))
	a.SetIcon(ui.AppIcon())

	w := a.NewWindow(ui.WindowTitle)
	w.SetIcon(ui.AppIcon())
	w.Resize(fyne.NewSize(ui.WindowWidth, ui.WindowHeight))
	w.CenterOnScreen()

	ctrl := ui.NewAppController(a, w)
	ctrl.ShowListView()

	go ctrl.RunPythonCheck()
	go ctrl.RunUpdateCheck()

	w.ShowAndRun()

	// Cleanup tooltip layer (fyne-tooltip best practice for window teardown).
	fynetooltip.DestroyWindowToolTipLayer(w.Canvas())
}
