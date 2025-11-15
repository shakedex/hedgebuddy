package ui

import (
	"fmt"

	"github.com/shakedex/hedgebuddy/internal/storage"

	"gioui.org/layout"
	"gioui.org/unit"
	"gioui.org/widget/material"
)

// App holds the main application state
type App struct {
	Storage      *storage.Storage
	ListView     *ListView
	AddForm      *AddForm
	EditForm     *EditForm
	DeleteDialog *DeleteDialog

	// View state
	currentView string // "list", "add", "edit", "delete-confirm"
}

// NewApp creates a new application instance
func NewApp(store *storage.Storage) *App {
	return &App{
		Storage:      store,
		ListView:     NewListView(),
		AddForm:      NewAddForm(),
		EditForm:     NewEditForm(),
		DeleteDialog: NewDeleteDialog(),
		currentView:  "list",
	}
}

// Layout renders the current view
func (a *App) Layout(gtx layout.Context, th *material.Theme) layout.Dimensions {
	switch a.currentView {
	case "add":
		return a.AddForm.Layout(gtx, th, a)
	case "edit":
		return a.EditForm.Layout(gtx, th, a)
	case "delete-confirm":
		return a.DeleteDialog.Layout(gtx, th, a)
	default:
		return a.ListView.Layout(gtx, th, a)
	}
}

// ShowAddForm switches to the add variable form
func (a *App) ShowAddForm() {
	a.currentView = "add"
	a.AddForm.Reset()
}

// ShowEditForm switches to the edit variable form
func (a *App) ShowEditForm(name string) {
	a.currentView = "edit"
	v, ok := a.Storage.GetVariable(name)
	if ok {
		a.EditForm.Load(name, v)
	}
}

// ShowListView switches to the list view
func (a *App) ShowListView() {
	a.currentView = "list"
}

// ShowDeleteConfirm shows delete confirmation dialog
func (a *App) ShowDeleteConfirm(varName string) {
	a.DeleteDialog.Show(varName)
	a.currentView = "delete-confirm"
}

// Helper: Render error message
func RenderError(gtx layout.Context, th *material.Theme, errMsg string) layout.Dimensions {
	if errMsg == "" {
		return layout.Dimensions{}
	}

	return layout.Inset{Top: unit.Dp(10), Bottom: unit.Dp(10)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		label := material.Body2(th, fmt.Sprintf("❌ %s", errMsg))
		label.Color = th.Palette.ContrastBg // Red-ish color
		return label.Layout(gtx)
	})
}
