package ui

import (
	"image"
	"image/color"

	"github.com/shakedex/hedgebuddy/internal/storage"
	"github.com/shakedex/hedgebuddy/internal/validator"

	"gioui.org/layout"
	"gioui.org/op/clip"
	"gioui.org/op/paint"
	"gioui.org/unit"
	"gioui.org/widget"
	"gioui.org/widget/material"
)

// AddForm handles adding new variables
type AddForm struct {
	nameInput  widget.Editor
	valueInput widget.Editor
	descInput  widget.Editor
	typeList   widget.Enum
	saveBtn    widget.Clickable
	cancelBtn  widget.Clickable
	errorMsg   string
}

// NewAddForm creates a new add form
func NewAddForm() *AddForm {
	form := &AddForm{}
	form.Reset()
	return form
}

// Reset clears the form
func (af *AddForm) Reset() {
	af.nameInput = widget.Editor{SingleLine: true, Submit: false}
	af.valueInput = widget.Editor{SingleLine: true, Submit: false}
	af.descInput = widget.Editor{SingleLine: true, Submit: false}
	af.typeList = widget.Enum{Value: "string"}
	af.errorMsg = ""
}

// Layout renders the add form
func (af *AddForm) Layout(gtx layout.Context, th *material.Theme, app *App) layout.Dimensions {
	// Handle button clicks
	if af.cancelBtn.Clicked(gtx) {
		app.ShowListView()
	}

	if af.saveBtn.Clicked(gtx) {
		if err := af.save(app); err != nil {
			af.errorMsg = err.Error()
		} else {
			app.ShowListView()
		}
	}

	return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
		// Header with back button
		layout.Rigid(func(gtx layout.Context) layout.Dimensions {
			return layout.Inset{Top: unit.Dp(20), Bottom: unit.Dp(16), Left: unit.Dp(24), Right: unit.Dp(24)}.Layout(gtx,
				func(gtx layout.Context) layout.Dimensions {
					return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							backBtn := material.Button(th, &af.cancelBtn, "← Back")
							backBtn.Background = color.NRGBA{R: 50, G: 50, B: 55, A: 255}
							backBtn.Color = color.NRGBA{R: 200, G: 200, B: 210, A: 255}
							backBtn.CornerRadius = unit.Dp(6)
							backBtn.TextSize = unit.Sp(14)
							backBtn.Inset = layout.Inset{Top: unit.Dp(8), Bottom: unit.Dp(8), Left: unit.Dp(12), Right: unit.Dp(12)}
							return layout.Inset{Right: unit.Dp(20)}.Layout(gtx, backBtn.Layout)
						}),
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							title := material.H5(th, "Add New Variable")
							title.Color = color.NRGBA{R: 240, G: 240, B: 245, A: 255}
							title.TextSize = unit.Sp(24)
							return title.Layout(gtx)
						}),
					)
				},
			)
		}),

		// Error message
		layout.Rigid(func(gtx layout.Context) layout.Dimensions {
			if af.errorMsg != "" {
				return layout.Inset{Left: unit.Dp(24), Right: unit.Dp(24), Bottom: unit.Dp(16)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
					return layout.Flex{Axis: layout.Horizontal}.Layout(gtx,
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							msg := material.Body2(th, "⚠ "+af.errorMsg)
							msg.Color = color.NRGBA{R: 220, G: 80, B: 80, A: 255}
							msg.TextSize = unit.Sp(14)
							return msg.Layout(gtx)
						}),
					)
				})
			}
			return layout.Dimensions{}
		}),

		// Form content
		layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
			return layout.Inset{Left: unit.Dp(40), Right: unit.Dp(40), Bottom: unit.Dp(40)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
				return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
					// ROW 1: Variable Name & Type (side by side in same card)
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return layout.Inset{Bottom: unit.Dp(16)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
							return layout.Stack{}.Layout(gtx,
								// Card background - FULL WIDTH
								layout.Expanded(func(gtx layout.Context) layout.Dimensions {
									rr := clip.UniformRRect(image.Rectangle{Max: gtx.Constraints.Max}, 8)
									defer rr.Push(gtx.Ops).Pop()
									bgColor := color.NRGBA{R: 40, G: 40, B: 45, A: 255}
									paint.ColorOp{Color: bgColor}.Add(gtx.Ops)
									paint.PaintOp{}.Add(gtx.Ops)
									return layout.Dimensions{Size: gtx.Constraints.Max}
								}),
								// Content: Name on left, Type on right
								layout.Stacked(func(gtx layout.Context) layout.Dimensions {
									return layout.Inset{Top: unit.Dp(20), Bottom: unit.Dp(20), Left: unit.Dp(20), Right: unit.Dp(20)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
										return layout.Flex{Axis: layout.Horizontal}.Layout(gtx,
											// Left: Variable Name (45% width)
											layout.Flexed(0.45, func(gtx layout.Context) layout.Dimensions {
												return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
													layout.Rigid(func(gtx layout.Context) layout.Dimensions {
														label := material.Body1(th, "Variable Name")
														label.Color = color.NRGBA{R: 160, G: 160, B: 170, A: 255}
														label.TextSize = unit.Sp(12)
														return layout.Inset{Bottom: unit.Dp(8)}.Layout(gtx, label.Layout)
													}),
													layout.Rigid(func(gtx layout.Context) layout.Dimensions {
														ed := material.Editor(th, &af.nameInput, "e.g., API_KEY")
														ed.TextSize = unit.Sp(16)
														ed.Color = color.NRGBA{R: 240, G: 240, B: 245, A: 255}
														ed.HintColor = color.NRGBA{R: 100, G: 100, B: 110, A: 255}
														return ed.Layout(gtx)
													}),
												)
											}),
											// Spacer between name and type
											layout.Rigid(layout.Spacer{Width: unit.Dp(24)}.Layout),
											// Right: Variable Type (55% width)
											layout.Flexed(0.55, func(gtx layout.Context) layout.Dimensions {
												return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
													layout.Rigid(func(gtx layout.Context) layout.Dimensions {
														label := material.Body1(th, "Variable Type")
														label.Color = color.NRGBA{R: 160, G: 160, B: 170, A: 255}
														label.TextSize = unit.Sp(12)
														return layout.Inset{Bottom: unit.Dp(8)}.Layout(gtx, label.Layout)
													}),
													layout.Rigid(func(gtx layout.Context) layout.Dimensions {
														return layout.Flex{Axis: layout.Horizontal, Spacing: layout.SpaceBetween}.Layout(gtx,
															layout.Rigid(func(gtx layout.Context) layout.Dimensions {
																rb := material.RadioButton(th, &af.typeList, "string", "String")
																rb.IconColor = color.NRGBA{R: 66, G: 135, B: 245, A: 255}
																rb.Size = unit.Dp(20)
																return rb.Layout(gtx)
															}),
															layout.Rigid(func(gtx layout.Context) layout.Dimensions {
																rb := material.RadioButton(th, &af.typeList, "path", "Path")
																rb.IconColor = color.NRGBA{R: 66, G: 135, B: 245, A: 255}
																rb.Size = unit.Dp(20)
																return rb.Layout(gtx)
															}),
															layout.Rigid(func(gtx layout.Context) layout.Dimensions {
																rb := material.RadioButton(th, &af.typeList, "url", "URL")
																rb.IconColor = color.NRGBA{R: 66, G: 135, B: 245, A: 255}
																rb.Size = unit.Dp(20)
																return rb.Layout(gtx)
															}),
															layout.Rigid(func(gtx layout.Context) layout.Dimensions {
																rb := material.RadioButton(th, &af.typeList, "secure", "Secure")
																rb.IconColor = color.NRGBA{R: 66, G: 135, B: 245, A: 255}
																rb.Size = unit.Dp(20)
																return rb.Layout(gtx)
															}),
														)
													}),
													// Type description
													layout.Rigid(func(gtx layout.Context) layout.Dimensions {
														var desc string
														switch af.typeList.Value {
														case "string":
															desc = "General text value (default)"
														case "path":
															desc = "File or directory path - validates existence"
														case "url":
															desc = "Web URL - validates format"
														case "secure":
															desc = "Sensitive data like passwords or API keys"
														}
														hint := material.Caption(th, desc)
														hint.Color = color.NRGBA{R: 120, G: 120, B: 130, A: 255}
														hint.TextSize = unit.Sp(11)
														return layout.Inset{Top: unit.Dp(6)}.Layout(gtx, hint.Layout)
													}),
												)
											}),
										)
									})
								}),
							)
						})
					}),

					// ROW 2: Value (full width card)
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return layout.Inset{Bottom: unit.Dp(16)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
							return layout.Stack{}.Layout(gtx,
								// Card background - FULL WIDTH
								layout.Expanded(func(gtx layout.Context) layout.Dimensions {
									rr := clip.UniformRRect(image.Rectangle{Max: gtx.Constraints.Max}, 8)
									defer rr.Push(gtx.Ops).Pop()
									bgColor := color.NRGBA{R: 40, G: 40, B: 45, A: 255}
									paint.ColorOp{Color: bgColor}.Add(gtx.Ops)
									paint.PaintOp{}.Add(gtx.Ops)
									return layout.Dimensions{Size: gtx.Constraints.Max}
								}),
								// Content
								layout.Stacked(func(gtx layout.Context) layout.Dimensions {
									return layout.Inset{Top: unit.Dp(20), Bottom: unit.Dp(20), Left: unit.Dp(20), Right: unit.Dp(20)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
										return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
											layout.Rigid(func(gtx layout.Context) layout.Dimensions {
												label := material.Body1(th, "Value")
												label.Color = color.NRGBA{R: 160, G: 160, B: 170, A: 255}
												label.TextSize = unit.Sp(12)
												return layout.Inset{Bottom: unit.Dp(8)}.Layout(gtx, label.Layout)
											}),
											layout.Rigid(func(gtx layout.Context) layout.Dimensions {
												ed := material.Editor(th, &af.valueInput, "Enter the variable value...")
												ed.TextSize = unit.Sp(16)
												ed.Color = color.NRGBA{R: 240, G: 240, B: 245, A: 255}
												ed.HintColor = color.NRGBA{R: 100, G: 100, B: 110, A: 255}
												return ed.Layout(gtx)
											}),
										)
									})
								}),
							)
						})
					}),

					// ROW 3: Description (full width card)
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return layout.Inset{Bottom: unit.Dp(24)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
							return layout.Stack{}.Layout(gtx,
								// Card background - FULL WIDTH
								layout.Expanded(func(gtx layout.Context) layout.Dimensions {
									rr := clip.UniformRRect(image.Rectangle{Max: gtx.Constraints.Max}, 8)
									defer rr.Push(gtx.Ops).Pop()
									bgColor := color.NRGBA{R: 40, G: 40, B: 45, A: 255}
									paint.ColorOp{Color: bgColor}.Add(gtx.Ops)
									paint.PaintOp{}.Add(gtx.Ops)
									return layout.Dimensions{Size: gtx.Constraints.Max}
								}),
								// Content
								layout.Stacked(func(gtx layout.Context) layout.Dimensions {
									return layout.Inset{Top: unit.Dp(20), Bottom: unit.Dp(20), Left: unit.Dp(20), Right: unit.Dp(20)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
										return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
											layout.Rigid(func(gtx layout.Context) layout.Dimensions {
												label := material.Body1(th, "Description (optional)")
												label.Color = color.NRGBA{R: 160, G: 160, B: 170, A: 255}
												label.TextSize = unit.Sp(12)
												return layout.Inset{Bottom: unit.Dp(8)}.Layout(gtx, label.Layout)
											}),
											layout.Rigid(func(gtx layout.Context) layout.Dimensions {
												ed := material.Editor(th, &af.descInput, "Brief description of what this variable is used for...")
												ed.TextSize = unit.Sp(16)
												ed.Color = color.NRGBA{R: 240, G: 240, B: 245, A: 255}
												ed.HintColor = color.NRGBA{R: 100, G: 100, B: 110, A: 255}
												return ed.Layout(gtx)
											}),
										)
									})
								}),
							)
						})
					}),

					// Save button (full width)
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						btn := material.Button(th, &af.saveBtn, "Save Variable")
						btn.Background = color.NRGBA{R: 66, G: 135, B: 245, A: 255}
						btn.Color = color.NRGBA{R: 255, G: 255, B: 255, A: 255}
						btn.CornerRadius = unit.Dp(8)
						btn.TextSize = unit.Sp(16)
						btn.Inset = layout.Inset{Top: unit.Dp(14), Bottom: unit.Dp(14)}
						return btn.Layout(gtx)
					}),
				)
			})
		}),
	)
}

func (af *AddForm) save(app *App) error {
	name := af.nameInput.Text()
	value := af.valueInput.Text()
	varType := af.typeList.Value
	desc := af.descInput.Text()

	// Validate name
	if err := validator.ValidateVariableName(name); err != nil {
		return err
	}

	// Validate value based on type
	if err := validator.ValidateByType(value, varType); err != nil {
		return err
	}

	// Add variable
	app.Storage.AddVariable(name, storage.Variable{
		Value:       value,
		Type:        varType,
		Description: desc,
	})

	// Save to disk
	return app.Storage.Save()
}
