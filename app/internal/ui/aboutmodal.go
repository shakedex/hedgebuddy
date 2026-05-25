package ui

import (
	"net/url"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/components"
	"app/internal/ui/icons"
	"app/internal/ui/tokens"
)

// ShowAboutModal opens the About centered modal.
func ShowAboutModal(c *AppController) {
	logo := canvas.NewImageFromResource(AppIcon())
	logo.FillMode = canvas.ImageFillContain
	logo.SetMinSize(fyne.NewSize(80, 80))

	title := canvas.NewText(AppName, tokens.Accent)
	title.TextSize = 24
	title.TextStyle = fyne.TextStyle{Bold: true}
	title.Alignment = fyne.TextAlignCenter

	version := canvas.NewText("v"+AppVersion, tokens.TextMuted)
	version.TextSize = 12
	version.Alignment = fyne.TextAlignCenter

	author := widget.NewLabel("Created by Shaked Lipszyc")
	author.Alignment = fyne.TextAlignCenter

	websiteBtn := widget.NewButtonWithIcon("shaked.co", icons.ExternalLink, func() {
		u, _ := url.Parse(WebsiteURL)
		_ = fyne.CurrentApp().OpenURL(u)
	})
	githubBtn := widget.NewButtonWithIcon("GitHub", icons.ExternalLink, func() {
		u, _ := url.Parse(GithubURL)
		_ = fyne.CurrentApp().OpenURL(u)
	})

	disclaimer := widget.NewLabel("Independent project. Not affiliated with Hedge (hedge.co). MIT licensed.")
	disclaimer.Wrapping = fyne.TextWrapWord
	disclaimer.Alignment = fyne.TextAlignCenter
	disclaimer.Importance = widget.LowImportance

	body := container.NewVBox(
		container.NewCenter(logo),
		title,
		version,
		widget.NewSeparator(),
		author,
		container.NewCenter(container.NewHBox(websiteBtn, githubBtn)),
		widget.NewSeparator(),
		disclaimer,
	)

	closeBtn := widget.NewButton("Close", nil)
	d := components.ShowCustomModal(c.Window, "About", body, []fyne.CanvasObject{
		layout.NewSpacer(), closeBtn,
	})
	closeBtn.OnTapped = func() { d.Hide() }
}
