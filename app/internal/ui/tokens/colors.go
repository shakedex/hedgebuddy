// Package tokens holds the single source of truth for design-system values.
// Theme.go and components reference these tokens; no hex literals elsewhere.
package tokens

import "image/color"

// Surfaces — backgrounds with progressive elevation.
var (
	SurfaceBase = color.NRGBA{R: 0x0E, G: 0x0E, B: 0x11, A: 0xFF}
	Surface1    = color.NRGBA{R: 0x15, G: 0x15, B: 0x1A, A: 0xFF}
	Surface2    = color.NRGBA{R: 0x1D, G: 0x1D, B: 0x24, A: 0xFF}
	Surface3    = color.NRGBA{R: 0x25, G: 0x25, B: 0x2F, A: 0xFF}
	Surface4    = color.NRGBA{R: 0x1A, G: 0x1A, B: 0x20, A: 0xFF}
)

// Borders.
var (
	BorderSubtle = color.NRGBA{R: 0x2A, G: 0x2A, B: 0x33, A: 0xFF}
	BorderFocus  = color.NRGBA{R: 0x4F, G: 0x7F, B: 0xF8, A: 0x59} // Accent @ ~35% alpha
)

// Text.
var (
	TextPrimary   = color.NRGBA{R: 0xE8, G: 0xE8, B: 0xEE, A: 0xFF}
	TextSecondary = color.NRGBA{R: 0xA4, G: 0xA4, B: 0xB3, A: 0xFF}
	TextMuted     = color.NRGBA{R: 0x6E, G: 0x6E, B: 0x80, A: 0xFF}
)

// Brand / state.
var (
	Accent      = color.NRGBA{R: 0x4F, G: 0x7F, B: 0xF8, A: 0xFF}
	AccentHover = color.NRGBA{R: 0x6B, G: 0x95, B: 0xFA, A: 0xFF}
	Danger      = color.NRGBA{R: 0xEF, G: 0x44, B: 0x44, A: 0xFF}
	Warning     = color.NRGBA{R: 0xF5, G: 0x9E, B: 0x0B, A: 0xFF}
	Success     = color.NRGBA{R: 0x22, G: 0xC5, B: 0x5E, A: 0xFF}
)

// DimOverlay — black at 50% alpha for drawer/modal scrims.
var DimOverlay = color.NRGBA{R: 0x00, G: 0x00, B: 0x00, A: 0x80}

// TypeColor returns the accent stripe color for a given variable type.
// Strings get TextMuted so the stripe is barely visible (string is the default).
func TypeColor(varType string) color.NRGBA {
	switch varType {
	case "path":
		return Success
	case "url":
		return Accent
	case "secret":
		return Danger
	default:
		return TextMuted
	}
}
