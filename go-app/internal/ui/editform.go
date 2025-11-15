package ui

import (
	"github.com/shakedex/hedgebuddy/internal/storage"
	"github.com/shakedex/hedgebuddy/internal/validator"

	"gioui.org/layout"
	"gioui.org/unit"
	"gioui.org/widget"
	"gioui.org/widget/material"
)

// EditForm handles editing existing variables
type EditForm struct {
	currentName string
	nameInput   widget.Editor
	valueInput  widget.Editor
	descInput   widget.Editor
	typeList    widget.Enum
	saveBtn     widget.Clickable
	cancelBtn   widget.Clickable
	errorMsg    string
}

// NewEditForm creates a new edit form
func NewEditForm() *EditForm {
	return &EditForm{}
}

// Load populates the form with existing variable data
func (ef *EditForm) Load(name string, v storage.Variable) {
	ef.currentName = name
	ef.nameInput = widget.Editor{SingleLine: true, Submit: false}
	ef.nameInput.SetText(name)
	ef.valueInput = widget.Editor{SingleLine: true, Submit: false}
	ef.valueInput.SetText(v.Value)
	ef.descInput = widget.Editor{SingleLine: true, Submit: false}
	ef.descInput.SetText(v.Description)
	ef.typeList = widget.Enum{Value: v.Type}
	ef.errorMsg = ""
}

// Layout renders the edit form
func (ef *EditForm) Layout(gtx layout.Context, th *material.Theme, app *App) layout.Dimensions {
	// Handle button clicks
	if ef.cancelBtn.Clicked(gtx) {
		app.ShowListView()
	}

	if ef.saveBtn.Clicked(gtx) {
		if err := ef.save(app); err != nil {
			ef.errorMsg = err.Error()
		} else {
			app.ShowListView()
		}
	}

	return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
		// Header
		layout.Rigid(func(gtx layout.Context) layout.Dimensions {
			return layout.Inset{Top: unit.Dp(20), Bottom: unit.Dp(20), Left: unit.Dp(20), Right: unit.Dp(20)}.Layout(gtx,
				func(gtx layout.Context) layout.Dimensions {
					return material.H4(th, "Edit Variable").Layout(gtx)
				},
			)
		}),

		// Form content (same as AddForm)
		layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
			return layout.Inset{Left: unit.Dp(20), Right: unit.Dp(20)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
				return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
					// Error message
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return RenderError(gtx, th, ef.errorMsg)
					}),

					// Name input
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return layout.Inset{Bottom: unit.Dp(15)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
							return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									return material.Body1(th, "Variable Name:").Layout(gtx)
								}),
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									ed := material.Editor(th, &ef.nameInput, "")
									ed.TextSize = unit.Sp(14)
									return ed.Layout(gtx)
								}),
							)
						})
					}),

					// Type selector
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return layout.Inset{Bottom: unit.Dp(15)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
							return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									return material.Body1(th, "Type:").Layout(gtx)
								}),
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									return layout.Flex{Axis: layout.Horizontal}.Layout(gtx,
										layout.Rigid(material.RadioButton(th, &ef.typeList, "string", "String").Layout),
										layout.Rigid(material.RadioButton(th, &ef.typeList, "path", "Path").Layout),
										layout.Rigid(material.RadioButton(th, &ef.typeList, "url", "URL").Layout),
										layout.Rigid(material.RadioButton(th, &ef.typeList, "secure", "Secure").Layout),
									)
								}),
							)
						})
					}),

					// Value input
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return layout.Inset{Bottom: unit.Dp(15)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
							return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									return material.Body1(th, "Value:").Layout(gtx)
								}),
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									ed := material.Editor(th, &ef.valueInput, "")
									ed.TextSize = unit.Sp(14)
									return ed.Layout(gtx)
								}),
							)
						})
					}),

					// Description input
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return layout.Inset{Bottom: unit.Dp(20)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
							return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									return material.Body1(th, "Description (optional):").Layout(gtx)
								}),
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									ed := material.Editor(th, &ef.descInput, "")
									ed.TextSize = unit.Sp(14)
									return ed.Layout(gtx)
								}),
							)
						})
					}),

					// Buttons
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						return layout.Flex{Axis: layout.Horizontal, Spacing: layout.SpaceStart}.Layout(gtx,
							layout.Rigid(func(gtx layout.Context) layout.Dimensions {
								btn := material.Button(th, &ef.saveBtn, "💾 Save Changes")
								return layout.Inset{Right: unit.Dp(10)}.Layout(gtx, btn.Layout)
							}),
							layout.Rigid(func(gtx layout.Context) layout.Dimensions {
								btn := material.Button(th, &ef.cancelBtn, "Cancel")
								return btn.Layout(gtx)
							}),
						)
					}),
				)
			})
		}),
	)
}

func (ef *EditForm) save(app *App) error {
	name := ef.nameInput.Text()
	value := ef.valueInput.Text()
	varType := ef.typeList.Value
	desc := ef.descInput.Text()

	// Validate name
	if err := validator.ValidateVariableName(name); err != nil {
		return err
	}

	// Validate value based on type
	if err := validator.ValidateByType(value, varType); err != nil {
		return err
	}

	// If name changed, delete old variable
	if name != ef.currentName {
		app.Storage.DeleteVariable(ef.currentName)
	}

	// Update variable
	app.Storage.AddVariable(name, storage.Variable{
		Value:       value,
		Type:        varType,
		Description: desc,
	})

	// Save to disk
	return app.Storage.Save()
}
