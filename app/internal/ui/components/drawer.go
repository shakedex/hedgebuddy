package components

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/icons"
	"app/internal/ui/tokens"
)

// Drawer is a right-anchored overlay panel with a dimmed scrim.
// The owning shell places this inside a top-level Stack and toggles visibility.
type Drawer struct {
	widget.BaseWidget
	title   string
	content fyne.CanvasObject
	onClose func()
	visible bool
}

func NewDrawer() *Drawer {
	d := &Drawer{}
	d.ExtendBaseWidget(d)
	d.Hide()
	return d
}

// Open shows the drawer with the given title and body.
func (d *Drawer) Open(title string, content fyne.CanvasObject, onClose func()) {
	d.title = title
	d.content = content
	d.onClose = onClose
	d.visible = true
	d.Show()
	d.Refresh()
}

// Close hides the drawer and invokes the close callback.
func (d *Drawer) Close() {
	if !d.visible {
		return
	}
	d.visible = false
	if d.onClose != nil {
		d.onClose()
	}
	d.Hide()
}

// IsOpen returns true if the drawer is currently shown.
func (d *Drawer) IsOpen() bool { return d.visible }

func (d *Drawer) CreateRenderer() fyne.WidgetRenderer {
	panel := canvas.NewRectangle(tokens.Surface4)

	closeBtn := NewIconButton(icons.X, "Close", IconVariantNeutral, d.Close)

	titleText := canvas.NewText(d.title, tokens.TextPrimary)
	titleText.TextSize = 22
	titleText.TextStyle = fyne.TextStyle{Bold: true}

	header := container.NewBorder(nil, nil, titleText, closeBtn)

	var body fyne.CanvasObject
	if d.content == nil {
		body = container.NewPadded(widget.NewLabel(""))
	} else {
		body = container.NewPadded(d.content)
	}

	panelInner := container.NewBorder(
		container.NewPadded(header),
		nil, nil, nil,
		container.NewVScroll(body),
	)

	panelStack := container.NewStack(panel, panelInner)

	// The scrim covers the full window; the panel is anchored right at fixed width.
	scrimTappable := newTappableArea(d.Close)

	rightAnchored := container.NewBorder(nil, nil, nil, panelStack, scrimTappable)
	// We need to enforce panel width via a min-size wrapper.
	panel.SetMinSize(fyne.NewSize(tokens.DrawerWidth, 0))

	return widget.NewSimpleRenderer(rightAnchored)
}

// tappableArea is a click target painted with the dim overlay color.
// It overlays the scrim rectangle so taps anywhere outside the panel close the drawer.
type tappableArea struct {
	widget.BaseWidget
	onTap func()
}

func newTappableArea(onTap func()) *tappableArea {
	t := &tappableArea{onTap: onTap}
	t.ExtendBaseWidget(t)
	return t
}

func (t *tappableArea) Tapped(*fyne.PointEvent) {
	if t.onTap != nil {
		t.onTap()
	}
}

func (t *tappableArea) CreateRenderer() fyne.WidgetRenderer {
	r := canvas.NewRectangle(tokens.DimOverlay)
	return widget.NewSimpleRenderer(r)
}
