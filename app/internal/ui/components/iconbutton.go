// Package components hosts reusable widget primitives for the HedgeBuddy UI.
package components

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/driver/desktop"
	"fyne.io/fyne/v2/widget"

	ttwidget "github.com/dweymouth/fyne-tooltip/widget"

	"app/internal/ui/tokens"
)

// IconButtonVariant controls hover-color behavior.
type IconButtonVariant int

const (
	// IconVariantNeutral: muted at rest, primary-tinted background on hover.
	IconVariantNeutral IconButtonVariant = iota
	// IconVariantDanger: muted at rest, danger-tinted background on hover.
	IconVariantDanger
)

// IconButton is the canonical icon-only action affordance.
//
// It embeds ttwidget.ToolTipWidget so the tooltip layer fires on hover, and
// paints a subtle accent/danger-tinted background overlay so users get visible
// hover feedback (Fyne's stock LowImportance hover effect is barely perceptible
// against our dark surface palette).
type IconButton struct {
	ttwidget.ToolTipWidget
	icon     fyne.Resource
	variant  IconButtonVariant
	onTapped func()
	hover    bool
}

// NewIconButton creates a tooltip-equipped icon button with visible hover feedback.
func NewIconButton(icon fyne.Resource, tooltip string, variant IconButtonVariant, tapped func()) *IconButton {
	b := &IconButton{
		icon:     icon,
		variant:  variant,
		onTapped: tapped,
	}
	b.SetToolTip(tooltip)
	b.ExtendBaseWidget(b)
	return b
}

// SetIcon updates the displayed icon and triggers a refresh.
func (b *IconButton) SetIcon(icon fyne.Resource) {
	b.icon = icon
	b.Refresh()
}

// SetOnTapped rewires the click handler (used for callsites that need to wire
// the handler after construction, e.g. profile-row menus that reference the
// button itself inside the handler).
func (b *IconButton) SetOnTapped(handler func()) {
	b.onTapped = handler
}

// Tapped delegates to the configured handler.
func (b *IconButton) Tapped(*fyne.PointEvent) {
	if b.onTapped != nil {
		b.onTapped()
	}
}

// MouseIn / MouseOut / MouseMoved must chain to the embedded ToolTipWidget so
// the tooltip mechanic fires; they also flip our hover flag for the overlay.
func (b *IconButton) MouseIn(e *desktop.MouseEvent) {
	b.ToolTipWidget.MouseIn(e)
	b.hover = true
	b.Refresh()
}

func (b *IconButton) MouseOut() {
	b.ToolTipWidget.MouseOut()
	b.hover = false
	b.Refresh()
}

func (b *IconButton) MouseMoved(e *desktop.MouseEvent) {
	b.ToolTipWidget.MouseMoved(e)
}

// Cursor reports the cursor to display when hovered.
func (b *IconButton) Cursor() desktop.Cursor { return desktop.PointerCursor }

func (b *IconButton) hoverTint() color.NRGBA {
	if b.variant == IconVariantDanger {
		// Danger at ~22% alpha — a soft red wash that signals the destructive action.
		return color.NRGBA{R: 0xEF, G: 0x44, B: 0x44, A: 0x38}
	}
	// Accent at ~22% alpha.
	return color.NRGBA{R: 0x4F, G: 0x7F, B: 0xF8, A: 0x38}
}

type iconButtonRenderer struct {
	btn  *IconButton
	bg   *canvas.Rectangle
	icon *widget.Icon
	root fyne.CanvasObject
}

func (r *iconButtonRenderer) Destroy() {}

func (r *iconButtonRenderer) Layout(s fyne.Size) { r.root.Resize(s) }

func (r *iconButtonRenderer) MinSize() fyne.Size {
	// Match Fyne's stock button icon size so HBoxes don't reflow.
	return fyne.NewSize(32, 32)
}

func (r *iconButtonRenderer) Objects() []fyne.CanvasObject {
	return []fyne.CanvasObject{r.root}
}

func (r *iconButtonRenderer) Refresh() {
	if r.btn.hover {
		r.bg.FillColor = r.btn.hoverTint()
	} else {
		r.bg.FillColor = color.NRGBA{0, 0, 0, 0} // transparent at rest
	}
	r.bg.Refresh()

	r.icon.SetResource(r.btn.icon)
}

// CreateRenderer wires the hover background + icon into a Stack.
func (b *IconButton) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(color.NRGBA{0, 0, 0, 0})
	bg.CornerRadius = tokens.RadiusButton

	icon := widget.NewIcon(b.icon)

	// Pad the icon a touch so the hover background reads as a button-sized
	// pill rather than a tight square around the glyph.
	root := container.NewStack(bg, container.NewPadded(icon))
	return &iconButtonRenderer{
		btn:  b,
		bg:   bg,
		icon: icon,
		root: root,
	}
}
