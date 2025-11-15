package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "HedgeBuddy - Variable Manager",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 26, G: 26, B: 31, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
		EnableDefaultContextMenu: true,
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: false,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
