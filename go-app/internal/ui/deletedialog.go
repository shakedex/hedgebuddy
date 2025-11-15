package ui

import (
	"fmt"
	"image/color"

	"gioui.org/layout"
	"gioui.org/unit"
	"gioui.org/widget"
	"gioui.org/widget/material"
)

// DeleteDialog handles the delete confirmation
type DeleteDialog struct {
	varName    string
	confirmBtn widget.Clickable
	cancelBtn  widget.Clickable
}

// NewDeleteDialog creates a new delete dialog
func NewDeleteDialog() *DeleteDialog {
	return &DeleteDialog{}
}

// Show sets the variable to delete
func (dd *DeleteDialog) Show(varName string) {
	dd.varName = varName
}

// Layout renders the delete confirmation dialog
func (dd *DeleteDialog) Layout(gtx layout.Context, th *material.Theme, app *App) layout.Dimensions {
	if dd.confirmBtn.Clicked(gtx) {
		app.Storage.DeleteVariable(dd.varName)
		app.Storage.Save()
		app.ShowListView()
	}

	if dd.cancelBtn.Clicked(gtx) {
		app.ShowListView()
	}

	return layout.Center.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return layout.Inset{Top: unit.Dp(40), Bottom: unit.Dp(40), Left: unit.Dp(40), Right: unit.Dp(40)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			return layout.Flex{Axis: layout.Vertical, Alignment: layout.Middle}.Layout(gtx,
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					title := material.H6(th, "Delete Variable?")
					title.Color = color.NRGBA{R: 240, G: 240, B: 245, A: 255}
					title.TextSize = unit.Sp(22)
					return layout.Inset{Bottom: unit.Dp(16)}.Layout(gtx, title.Layout)
				}),
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					msg := material.Body1(th, fmt.Sprintf("Are you sure you want to delete '%s'?", dd.varName))
					msg.Color = color.NRGBA{R: 200, G: 200, B: 210, A: 255}
					msg.TextSize = unit.Sp(15)
					return layout.Inset{Bottom: unit.Dp(24)}.Layout(gtx, msg.Layout)
				}),
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					return layout.Flex{Axis: layout.Horizontal, Spacing: layout.SpaceEvenly}.Layout(gtx,
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							btn := material.Button(th, &dd.cancelBtn, "Cancel")
							btn.Background = color.NRGBA{R: 60, G: 60, B: 65, A: 255}
							btn.Color = color.NRGBA{R: 200, G: 200, B: 210, A: 255}
							btn.CornerRadius = unit.Dp(6)
							btn.TextSize = unit.Sp(15)
							btn.Inset = layout.Inset{Top: unit.Dp(12), Bottom: unit.Dp(12), Left: unit.Dp(28), Right: unit.Dp(28)}
							return layout.Inset{Right: unit.Dp(16)}.Layout(gtx, btn.Layout)
						}),
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							btn := material.Button(th, &dd.confirmBtn, "Delete")
							btn.Background = color.NRGBA{R: 220, G: 53, B: 69, A: 255}
							btn.Color = color.NRGBA{R: 255, G: 255, B: 255, A: 255}
							btn.CornerRadius = unit.Dp(6)
							btn.TextSize = unit.Sp(15)
							btn.Inset = layout.Inset{Top: unit.Dp(12), Bottom: unit.Dp(12), Left: unit.Dp(28), Right: unit.Dp(28)}
							return btn.Layout(gtx)
						}),
					)
				}),
			)
		})
	})
}
