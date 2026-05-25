package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"

	"app/internal/ui/tokens"
)

// HedgeBuddyTheme implements a custom dark-only theme backed by tokens.
type HedgeBuddyTheme struct {
	font     fyne.Resource // optional OS-native regular font; nil falls back to default
	fontBold fyne.Resource // optional OS-native semibold; nil falls back to default
}

var _ fyne.Theme = (*HedgeBuddyTheme)(nil)

// NewHedgeBuddyTheme returns a theme with optional OS-native font resources.
// Pass nils to fall back to Fyne's default font.
func NewHedgeBuddyTheme(regular, bold fyne.Resource) *HedgeBuddyTheme {
	return &HedgeBuddyTheme{font: regular, fontBold: bold}
}

func (t *HedgeBuddyTheme) Color(name fyne.ThemeColorName, _ fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNameBackground:
		return tokens.SurfaceBase
	case theme.ColorNameButton:
		return tokens.Surface3
	case theme.ColorNameDisabledButton:
		return tokens.Surface2
	case theme.ColorNameDisabled:
		return tokens.TextMuted
	case theme.ColorNameError:
		return tokens.Danger
	case theme.ColorNameForeground:
		return tokens.TextPrimary
	case theme.ColorNameHover:
		return color.NRGBA{R: 0xFF, G: 0xFF, B: 0xFF, A: 0x14}
	case theme.ColorNameInputBackground:
		return tokens.Surface3
	case theme.ColorNameInputBorder:
		return tokens.BorderSubtle
	case theme.ColorNamePlaceHolder:
		return tokens.TextMuted
	case theme.ColorNamePrimary:
		return tokens.Accent
	case theme.ColorNameScrollBar:
		return tokens.TextMuted
	case theme.ColorNameSeparator:
		return tokens.BorderSubtle
	case theme.ColorNameShadow:
		return color.NRGBA{R: 0x00, G: 0x00, B: 0x00, A: 0x88}
	case theme.ColorNameHeaderBackground:
		return tokens.Surface1
	case theme.ColorNameMenuBackground:
		return tokens.Surface1
	case theme.ColorNameOverlayBackground:
		return tokens.Surface1
	case theme.ColorNameSelection:
		return color.NRGBA{R: 0x4F, G: 0x7F, B: 0xF8, A: 0x30}
	case theme.ColorNameFocus:
		return tokens.BorderFocus
	case theme.ColorNameSuccess:
		return tokens.Success
	case theme.ColorNameWarning:
		return tokens.Warning
	}
	return theme.DefaultTheme().Color(name, theme.VariantDark)
}

func (t *HedgeBuddyTheme) Font(style fyne.TextStyle) fyne.Resource {
	if style.Bold && t.fontBold != nil {
		return t.fontBold
	}
	if !style.Bold && t.font != nil {
		return t.font
	}
	return theme.DefaultTheme().Font(style)
}

func (t *HedgeBuddyTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	return theme.DefaultTheme().Icon(name)
}

func (t *HedgeBuddyTheme) Size(name fyne.ThemeSizeName) float32 {
	switch name {
	case theme.SizeNamePadding:
		return tokens.SpaceSM
	case theme.SizeNameInnerPadding:
		return tokens.SpaceSM
	case theme.SizeNameText:
		return 13
	case theme.SizeNameHeadingText:
		return 22
	case theme.SizeNameSubHeadingText:
		return 16
	case theme.SizeNameCaptionText:
		return 11
	case theme.SizeNameSeparatorThickness:
		return 1
	case theme.SizeNameScrollBarSmall:
		return 6
	case theme.SizeNameScrollBar:
		return 10
	case theme.SizeNameLineSpacing:
		return 4
	case theme.SizeNameInputBorder:
		return 1
	}
	return theme.DefaultTheme().Size(name)
}

// AppIcon returns the bundled app icon resource (mascot, defined in bundled.go).
func AppIcon() fyne.Resource {
	return resourceIconPng
}

// TypeColor proxies to tokens.TypeColor for callers in this package.
func TypeColor(varType string) color.NRGBA {
	return tokens.TypeColor(varType)
}

