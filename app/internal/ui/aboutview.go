package ui

import (
	"net/url"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
)

// NewAboutView creates the about/info view
func NewAboutView(ctrl *AppController) fyne.CanvasObject {
	// Logo
	logo := canvas.NewImageFromResource(AppIcon())
	logo.FillMode = canvas.ImageFillContain
	logo.SetMinSize(fyne.NewSize(80, 80))

	titleLabel := canvas.NewText(AppName, ColorAccentBlue)
	titleLabel.TextSize = 28
	titleLabel.TextStyle = fyne.TextStyle{Bold: true}
	titleLabel.Alignment = fyne.TextAlignCenter

	versionLabel := canvas.NewText("v"+AppVersion, ColorTextMuted)
	versionLabel.TextSize = 13
	versionLabel.Alignment = fyne.TextAlignCenter

	// Author — use plain Label (not RichText) to avoid vertical text bug
	authorLabel := widget.NewLabel("Created by Shaked Lipszyc")
	authorLabel.Alignment = fyne.TextAlignCenter
	authorLabel.TextStyle = fyne.TextStyle{Bold: false}

	// Links
	websiteBtn := widget.NewButtonWithIcon("shaked.co", theme.ComputerIcon(), func() {
		u, _ := url.Parse(WebsiteURL)
		_ = fyne.CurrentApp().OpenURL(u)
	})

	githubBtn := widget.NewButtonWithIcon("GitHub Repository", theme.StorageIcon(), func() {
		u, _ := url.Parse(GithubURL)
		_ = fyne.CurrentApp().OpenURL(u)
	})

	links := container.NewCenter(container.NewHBox(websiteBtn, githubBtn))

	// Built with
	builtWithTitle := canvas.NewText("Built With", ColorTextPrimary)
	builtWithTitle.TextSize = 17
	builtWithTitle.TextStyle = fyne.TextStyle{Bold: true}

	techItem1 := widget.NewLabel("  •  Fyne — Go native GUI framework")
	techItem2 := widget.NewLabel("  •  Go — Backend & UI language")
	techItem3 := widget.NewLabel("  •  Python — HedgeBuddy library")
	techItem1.Importance = widget.LowImportance
	techItem2.Importance = widget.LowImportance
	techItem3.Importance = widget.LowImportance

	// Disclaimer
	disclaimerTitle := canvas.NewText("Disclaimer", ColorTextPrimary)
	disclaimerTitle.TextSize = 17
	disclaimerTitle.TextStyle = fyne.TextStyle{Bold: true}

	disclaimerText := widget.NewLabel(
		"HedgeBuddy is an independent, open-source project and is NOT affiliated with, " +
			"endorsed by, or officially associated with Hedge (hedge.co) or its software Offshoot, Foolcat and EditReady. " +
			"This software is provided \"as is\" without warranty of any kind.",
	)
	disclaimerText.Wrapping = fyne.TextWrapWord
	disclaimerText.Importance = widget.LowImportance

	licenseLabel := canvas.NewText("Licensed under MIT License", ColorTextMuted)
	licenseLabel.TextSize = 12
	licenseLabel.Alignment = fyne.TextAlignCenter

	// Compose content with generous spacing
	content := container.NewVBox(
		container.NewCenter(logo),
		container.NewCenter(titleLabel),
		container.NewCenter(versionLabel),
		widget.NewSeparator(),
		container.NewCenter(authorLabel),
		links,
		widget.NewSeparator(),
		builtWithTitle,
		techItem1,
		techItem2,
		techItem3,
		widget.NewSeparator(),
		disclaimerTitle,
		disclaimerText,
		widget.NewSeparator(),
		container.NewCenter(licenseLabel),
	)

	scrollable := container.NewVScroll(container.NewPadded(content))

	backBtn := widget.NewButtonWithIcon("Back", theme.NavigateBackIcon(), func() {
		ctrl.ShowListView()
	})

	header := container.NewHBox(backBtn, layout.NewSpacer())

	return container.NewBorder(header, nil, nil, nil, scrollable)
}
