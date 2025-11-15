package main

import (
	"image/color"
	"log"

	"github.com/shakedex/hedgebuddy/internal/storage"
	"github.com/shakedex/hedgebuddy/internal/ui"

	"gioui.org/app"
	"gioui.org/font/gofont"
	"gioui.org/op"
	"gioui.org/op/paint"
	"gioui.org/text"
	"gioui.org/widget/material"
)

func main() {
	go func() {
		// Create window
		w := new(app.Window)
		w.Option(app.Title("HedgeBuddy - Variable Manager"))
		w.Option(app.Size(900, 650))

		// Initialize dark theme
		th := material.NewTheme()
		th.Shaper = text.NewShaper(text.WithCollection(gofont.Collection()))

		// Dark theme colors
		th.Palette.Bg = color.NRGBA{R: 24, G: 24, B: 28, A: 255}            // Very dark background
		th.Palette.Fg = color.NRGBA{R: 240, G: 240, B: 245, A: 255}         // Light text
		th.Palette.ContrastBg = color.NRGBA{R: 66, G: 135, B: 245, A: 255}  // Blue accent
		th.Palette.ContrastFg = color.NRGBA{R: 255, G: 255, B: 255, A: 255} // White

		// Load storage
		store, err := storage.Load()
		if err != nil {
			log.Printf("Error loading storage: %v", err)
			store = &storage.Storage{Variables: make(map[string]storage.Variable)}
		}

		// Create UI app
		appUI := ui.NewApp(store)

		// Event loop
		var ops op.Ops
		for {
			switch e := w.Event().(type) {
			case app.DestroyEvent:
				return
			case app.FrameEvent:
				gtx := app.NewContext(&ops, e)

				// Paint dark background
				paint.Fill(gtx.Ops, th.Palette.Bg)

				appUI.Layout(gtx, th)
				e.Frame(gtx.Ops)
			}
		}
	}()

	// Start app
	app.Main()
}
