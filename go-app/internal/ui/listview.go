package ui

import (
	"image"
	"image/color"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/shakedex/hedgebuddy/internal/storage"

	"gio.tools/icons"
	"gioui.org/layout"
	"gioui.org/op/clip"
	"gioui.org/op/paint"
	"gioui.org/unit"
	"gioui.org/widget"
	"gioui.org/widget/material"
)

// ListView displays the list of variables
type ListView struct {
	list          widget.List
	addBtn        widget.Clickable
	refreshBtn    widget.Clickable
	openFolderBtn widget.Clickable
	// Store buttons per index instead of per name
	editBtns []widget.Clickable
	delBtns  []widget.Clickable
}

// NewListView creates a new list view
func NewListView() *ListView {
	return &ListView{
		list:     widget.List{List: layout.List{Axis: layout.Vertical}},
		editBtns: make([]widget.Clickable, 0),
		delBtns:  make([]widget.Clickable, 0),
	}
}

// Layout renders the list view
func (lv *ListView) Layout(gtx layout.Context, th *material.Theme, app *App) layout.Dimensions {
	// Check if add button clicked
	if lv.addBtn.Clicked(gtx) {
		app.ShowAddForm()
	}

	// Check if refresh button clicked
	if lv.refreshBtn.Clicked(gtx) {
		if newStorage, err := storage.Load(); err == nil {
			app.Storage = newStorage
		}
	}

	// Check if open folder button clicked
	if lv.openFolderBtn.Clicked(gtx) {
		if storagePath, err := storage.GetStoragePath(); err == nil {
			go openFolder(storagePath)
		}
	}

	// Get sorted keys
	keys := app.Storage.GetSortedKeys()

	// Ensure we have enough buttons for all variables
	for len(lv.editBtns) < len(keys) {
		lv.editBtns = append(lv.editBtns, widget.Clickable{})
		lv.delBtns = append(lv.delBtns, widget.Clickable{})
	}

	// Check if any edit/delete buttons clicked
	for i := 0; i < len(keys) && i < len(lv.editBtns); i++ {
		if lv.editBtns[i].Clicked(gtx) {
			app.ShowEditForm(keys[i])
		}
		if lv.delBtns[i].Clicked(gtx) {
			app.ShowDeleteConfirm(keys[i])
		}
	}

	return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
		// Header
		layout.Rigid(func(gtx layout.Context) layout.Dimensions {
			return layout.Inset{Top: unit.Dp(24), Bottom: unit.Dp(12), Left: unit.Dp(24), Right: unit.Dp(24)}.Layout(gtx,
				func(gtx layout.Context) layout.Dimensions {
					return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
						layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
							title := material.H4(th, "HedgeBuddy")
							title.Color = color.NRGBA{R: 240, G: 240, B: 245, A: 255}
							title.TextSize = unit.Sp(28)
							return title.Layout(gtx)
						}),
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							btn := material.IconButton(th, &lv.openFolderBtn, icons.FileFolderOpen, "Open Folder")
							btn.Background = color.NRGBA{R: 50, G: 50, B: 55, A: 255}
							btn.Color = color.NRGBA{R: 200, G: 200, B: 210, A: 255}
							btn.Size = unit.Dp(24)
							btn.Inset = layout.UniformInset(unit.Dp(10))
							return layout.Inset{Right: unit.Dp(10)}.Layout(gtx, btn.Layout)
						}),
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							btn := material.IconButton(th, &lv.refreshBtn, icons.NavigationRefresh, "Refresh")
							btn.Background = color.NRGBA{R: 50, G: 50, B: 55, A: 255}
							btn.Color = color.NRGBA{R: 200, G: 200, B: 210, A: 255}
							btn.Size = unit.Dp(24)
							btn.Inset = layout.UniformInset(unit.Dp(10))
							return layout.Inset{Right: unit.Dp(10)}.Layout(gtx, btn.Layout)
						}),
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							btn := material.Button(th, &lv.addBtn, "+ New")
							btn.Background = color.NRGBA{R: 66, G: 135, B: 245, A: 255}
							btn.Color = color.NRGBA{R: 255, G: 255, B: 255, A: 255}
							btn.TextSize = unit.Sp(15)
							btn.CornerRadius = unit.Dp(6)
							btn.Inset = layout.Inset{Top: unit.Dp(10), Bottom: unit.Dp(10), Left: unit.Dp(16), Right: unit.Dp(16)}
							return btn.Layout(gtx)
						}),
					)
				},
			)
		}),

		// Description
		layout.Rigid(func(gtx layout.Context) layout.Dimensions {
			return layout.Inset{Bottom: unit.Dp(16), Left: unit.Dp(24), Right: unit.Dp(24)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
				desc := material.Body2(th, "Manage environment variables for Hedge.co Python scripts • Click + New to add • Edit or delete existing variables")
				desc.Color = color.NRGBA{R: 140, G: 140, B: 150, A: 255}
				desc.TextSize = unit.Sp(13)
				return desc.Layout(gtx)
			})
		}), // Variable list
		layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
			if len(app.Storage.Variables) == 0 {
				return layout.Center.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
					label := material.Body1(th, "No variables yet. Click 'Add Variable' to create one.")
					label.Color = color.NRGBA{R: 130, G: 130, B: 140, A: 255}
					label.TextSize = unit.Sp(16)
					return label.Layout(gtx)
				})
			}

			// Get sorted list of variable names
			keys := app.Storage.GetSortedKeys()

			return layout.Inset{Left: unit.Dp(20), Right: unit.Dp(20)}.Layout(gtx,
				func(gtx layout.Context) layout.Dimensions {
					return material.List(th, &lv.list).Layout(gtx, len(keys), func(gtx layout.Context, i int) layout.Dimensions {
						if i >= len(keys) {
							return layout.Dimensions{}
						}
						name := keys[i]
						v := app.Storage.Variables[name]

						return lv.renderVariableCard(gtx, th, name, v, i)
					})
				},
			)
		}),
	)
}

func (lv *ListView) renderVariableCard(gtx layout.Context, th *material.Theme, name string, v storage.Variable, index int) layout.Dimensions {
	return layout.Inset{Top: unit.Dp(6), Bottom: unit.Dp(6)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		// Draw card with dark background and blue left border accent
		return layout.Stack{}.Layout(gtx,
			layout.Expanded(func(gtx layout.Context) layout.Dimensions {
				// Dark card background
				rr := clip.UniformRRect(image.Rectangle{Max: gtx.Constraints.Min}, 8)
				defer rr.Push(gtx.Ops).Pop()

				// Dark gray background (Spotify-like)
				bgColor := color.NRGBA{R: 40, G: 40, B: 45, A: 255}
				paint.ColorOp{Color: bgColor}.Add(gtx.Ops)
				paint.PaintOp{}.Add(gtx.Ops)

				return layout.Dimensions{Size: gtx.Constraints.Min}
			}),
			// Blue left accent bar
			layout.Stacked(func(gtx layout.Context) layout.Dimensions {
				accentWidth := gtx.Dp(4)
				accentRect := image.Rectangle{
					Max: image.Point{X: accentWidth, Y: gtx.Constraints.Min.Y},
				}
				defer clip.UniformRRect(accentRect, 8).Push(gtx.Ops).Pop()

				// Blue accent color
				accentColor := color.NRGBA{R: 66, G: 135, B: 245, A: 255}
				paint.ColorOp{Color: accentColor}.Add(gtx.Ops)
				paint.PaintOp{}.Add(gtx.Ops)

				return layout.Dimensions{Size: accentRect.Max}
			}),
			layout.Stacked(func(gtx layout.Context) layout.Dimensions {
				return layout.Inset{Top: unit.Dp(16), Bottom: unit.Dp(16), Left: unit.Dp(20), Right: unit.Dp(16)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
					return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
						// Variable info (left side)
						layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
							return layout.Flex{Axis: layout.Vertical, Spacing: layout.SpaceStart}.Layout(gtx,
								// Variable name and type
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Baseline}.Layout(gtx,
										layout.Rigid(func(gtx layout.Context) layout.Dimensions {
											label := material.Body1(th, name)
											label.Color = color.NRGBA{R: 240, G: 240, B: 245, A: 255} // Light text
											label.TextSize = unit.Sp(17)
											return label.Layout(gtx)
										}),
										layout.Rigid(func(gtx layout.Context) layout.Dimensions {
											// Type badge
											typeLabel := material.Caption(th, v.Type)
											typeLabel.Color = color.NRGBA{R: 150, G: 150, B: 160, A: 255}
											typeLabel.TextSize = unit.Sp(13)
											return layout.Inset{Left: unit.Dp(12)}.Layout(gtx, typeLabel.Layout)
										}),
									)
								}),
								// Value
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									label := material.Body2(th, v.Value)
									label.Color = color.NRGBA{R: 180, G: 180, B: 190, A: 255} // Medium gray
									label.TextSize = unit.Sp(14)
									return layout.Inset{Top: unit.Dp(6)}.Layout(gtx, label.Layout)
								}),
								// Description
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									if v.Description != "" {
										label := material.Caption(th, v.Description)
										label.Color = color.NRGBA{R: 130, G: 130, B: 140, A: 255} // Dimmer gray
										label.TextSize = unit.Sp(12)
										return layout.Inset{Top: unit.Dp(4)}.Layout(gtx, label.Layout)
									}
									return layout.Dimensions{}
								}),
							)
						}),

						// Icon buttons (right side)
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							return layout.Flex{Axis: layout.Horizontal, Spacing: layout.SpaceStart}.Layout(gtx,
								// Edit button (blue icon)
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									btn := material.IconButton(th, &lv.editBtns[index], icons.ImageEdit, "Edit")
									btn.Background = color.NRGBA{R: 66, G: 135, B: 245, A: 255}
									btn.Color = color.NRGBA{R: 255, G: 255, B: 255, A: 255}
									btn.Size = unit.Dp(20)
									btn.Inset = layout.UniformInset(unit.Dp(10))
									return layout.Inset{Right: unit.Dp(8)}.Layout(gtx, btn.Layout)
								}),
								// Delete button (red icon)
								layout.Rigid(func(gtx layout.Context) layout.Dimensions {
									btn := material.IconButton(th, &lv.delBtns[index], icons.ActionDelete, "Delete")
									btn.Background = color.NRGBA{R: 220, G: 53, B: 69, A: 255}
									btn.Color = color.NRGBA{R: 255, G: 255, B: 255, A: 255}
									btn.Size = unit.Dp(20)
									btn.Inset = layout.UniformInset(unit.Dp(10))
									return btn.Layout(gtx)
								}),
							)
						}),
					)
				})
			}),
		)
	})
}

// openFolder opens the containing folder in file explorer
func openFolder(path string) {
	var cmd *exec.Cmd

	// Get the directory containing the file
	dir := path
	if info, err := os.Stat(path); err == nil && !info.IsDir() {
		dir = filepath.Dir(path)
	}

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", dir)
	case "darwin":
		cmd = exec.Command("open", dir)
	default:
		log.Printf("Unsupported platform for opening folder: %s", runtime.GOOS)
		return
	}

	if err := cmd.Start(); err != nil {
		log.Printf("Failed to open folder: %v", err)
	}
}
