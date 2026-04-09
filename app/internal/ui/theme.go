package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
)

// Color palette — single source of truth. Theme.Color() references these.
var (
	ColorBgPrimary   = color.NRGBA{R: 0x14, G: 0x14, B: 0x18, A: 0xFF}
	ColorBgSecondary = color.NRGBA{R: 0x1A, G: 0x1A, B: 0x20, A: 0xFF}
	ColorBgCard      = color.NRGBA{R: 0x22, G: 0x22, B: 0x2C, A: 0xFF}
	ColorBgButton    = color.NRGBA{R: 0x28, G: 0x28, B: 0x30, A: 0xFF}
	ColorBgInput     = color.NRGBA{R: 0x1C, G: 0x1C, B: 0x22, A: 0xFF}
	ColorBorder      = color.NRGBA{R: 0x38, G: 0x38, B: 0x42, A: 0xFF}
	ColorHover       = color.NRGBA{R: 0xFF, G: 0xFF, B: 0xFF, A: 0x14}
	ColorSeparator   = color.NRGBA{R: 0x26, G: 0x26, B: 0x2E, A: 0xFF}
	ColorTextPrimary = color.NRGBA{R: 0xEC, G: 0xEC, B: 0xF0, A: 0xFF}
	ColorTextSecond  = color.NRGBA{R: 0xA0, G: 0xA0, B: 0xAC, A: 0xFF}
	ColorTextMuted   = color.NRGBA{R: 0x88, G: 0x88, B: 0xA0, A: 0xFF}
	ColorAccentBlue  = color.NRGBA{R: 0x42, G: 0x87, B: 0xF5, A: 0xFF}
	ColorAccentRed   = color.NRGBA{R: 0xEF, G: 0x44, B: 0x44, A: 0xFF}
	ColorSuccess     = color.NRGBA{R: 0x22, G: 0xC5, B: 0x5E, A: 0xFF}
	ColorWarning     = color.NRGBA{R: 0xFA, G: 0xCC, B: 0x15, A: 0xFF}
)

// HedgeBuddyTheme implements a custom dark theme.
type HedgeBuddyTheme struct{}

var _ fyne.Theme = (*HedgeBuddyTheme)(nil)

func (t *HedgeBuddyTheme) Color(name fyne.ThemeColorName, _ fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNameBackground:
		return ColorBgPrimary
	case theme.ColorNameButton:
		return ColorBgButton
	case theme.ColorNameDisabledButton:
		return color.NRGBA{R: 0x20, G: 0x20, B: 0x26, A: 0xFF}
	case theme.ColorNameDisabled:
		return ColorTextMuted
	case theme.ColorNameError:
		return ColorAccentRed
	case theme.ColorNameForeground:
		return ColorTextPrimary
	case theme.ColorNameHover:
		return ColorHover
	case theme.ColorNameInputBackground:
		return ColorBgInput
	case theme.ColorNameInputBorder:
		return ColorBorder
	case theme.ColorNamePlaceHolder:
		return ColorTextMuted
	case theme.ColorNamePrimary:
		return ColorAccentBlue
	case theme.ColorNameScrollBar:
		return ColorTextMuted
	case theme.ColorNameSeparator:
		return ColorSeparator
	case theme.ColorNameShadow:
		return color.NRGBA{R: 0x00, G: 0x00, B: 0x00, A: 0x88}
	case theme.ColorNameHeaderBackground:
		return ColorBgSecondary
	case theme.ColorNameMenuBackground:
		return ColorBgSecondary
	case theme.ColorNameOverlayBackground:
		return color.NRGBA{R: 0x18, G: 0x18, B: 0x1C, A: 0xF4}
	case theme.ColorNameSelection:
		return color.NRGBA{R: 0x42, G: 0x87, B: 0xF5, A: 0x30}
	case theme.ColorNameFocus:
		return color.NRGBA{R: 0x42, G: 0x87, B: 0xF5, A: 0x50}
	case theme.ColorNameSuccess:
		return ColorSuccess
	case theme.ColorNameWarning:
		return ColorWarning
	}
	return theme.DefaultTheme().Color(name, theme.VariantDark)
}

func (t *HedgeBuddyTheme) Font(style fyne.TextStyle) fyne.Resource {
	return theme.DefaultTheme().Font(style)
}

func (t *HedgeBuddyTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	return theme.DefaultTheme().Icon(name)
}

func (t *HedgeBuddyTheme) Size(name fyne.ThemeSizeName) float32 {
	switch name {
	case theme.SizeNamePadding:
		return 8
	case theme.SizeNameInnerPadding:
		return 6
	case theme.SizeNameText:
		return 14
	case theme.SizeNameHeadingText:
		return 24
	case theme.SizeNameSubHeadingText:
		return 17
	case theme.SizeNameCaptionText:
		return 11
	case theme.SizeNameSeparatorThickness:
		return 1
	case theme.SizeNameScrollBarSmall:
		return 6
	case theme.SizeNameScrollBar:
		return 10
	case theme.SizeNameLineSpacing:
		return 6
	}
	return theme.DefaultTheme().Size(name)
}

// AppIcon returns the bundled app icon resource.
func AppIcon() fyne.Resource {
	return resourceIconPng
}

// TypeColor returns a distinct color for each variable type.
func TypeColor(varType string) color.NRGBA {
	switch varType {
	case TypePath:
		return ColorSuccess
	case TypeURL:
		return ColorAccentBlue
	case TypeSecret:
		return ColorAccentRed
	default:
		return ColorTextSecond
	}
}
