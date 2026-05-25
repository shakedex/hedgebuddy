// Package components hosts reusable widget primitives for the HedgeBuddy UI.
package components

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/widget"

	ttwidget "github.com/dweymouth/fyne-tooltip/widget"
)

// IconButtonVariant controls hover-color behavior.
type IconButtonVariant int

const (
	// IconVariantNeutral: muted at rest, primary on hover. Used for most actions.
	IconVariantNeutral IconButtonVariant = iota
	// IconVariantDanger: muted at rest, danger color on hover. Used for delete.
	IconVariantDanger
)

// IconButton is the canonical icon-only action affordance.
// At rest: muted tint. On hover: primary or danger tint.
// Tooltip via fyne-tooltip (kept as a third-party dep — Fyne core has no built-in tooltip API yet).
type IconButton struct {
	*ttwidget.Button
}

// NewIconButton creates a tooltip-equipped icon button. Variant controls hover color.
func NewIconButton(icon fyne.Resource, tooltip string, variant IconButtonVariant, tapped func()) *IconButton {
	btn := ttwidget.NewButtonWithIcon("", icon, tapped)
	btn.SetToolTip(tooltip)
	// Importance signals Fyne which theme color name to use for tinting.
	// We use LowImportance for neutral icons and DangerImportance for the trash variant.
	if variant == IconVariantDanger {
		btn.Importance = widget.DangerImportance
	} else {
		btn.Importance = widget.LowImportance
	}
	return &IconButton{Button: btn}
}
