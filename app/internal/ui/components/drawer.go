package components

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/icons"
	"app/internal/ui/tokens"
)

// transparent is a fully transparent fill used by spacer rectangles.
var transparent = color.NRGBA{}

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

// drawerRenderer is the reactive renderer for Drawer. The bodySlot container is
// a stable mount point — Open() updates d.title/d.content then Refresh() swaps
// the title text and replaces bodySlot.Objects.
type drawerRenderer struct {
	drawer    *Drawer
	scrim     *canvas.Rectangle
	panel     *canvas.Rectangle
	titleText *canvas.Text
	closeBtn  *IconButton
	bodySlot  *fyne.Container
	root      fyne.CanvasObject
}

func (r *drawerRenderer) Destroy()                     {}
func (r *drawerRenderer) Layout(s fyne.Size)           { r.root.Resize(s) }
func (r *drawerRenderer) MinSize() fyne.Size           { return r.root.MinSize() }
func (r *drawerRenderer) Objects() []fyne.CanvasObject { return []fyne.CanvasObject{r.root} }

func (r *drawerRenderer) Refresh() {
	r.titleText.Text = r.drawer.title
	r.titleText.Refresh()

	r.bodySlot.Objects = nil
	if r.drawer.content != nil {
		r.bodySlot.Add(r.drawer.content)
	}
	r.bodySlot.Refresh()
}

func (d *Drawer) CreateRenderer() fyne.WidgetRenderer {
	scrim := canvas.NewRectangle(tokens.DimOverlay)

	// Panel background. SetMinSize enforces DrawerWidth on the Stack containing
	// the panel content; in a Stack, the rectangle is then resized to whatever
	// the Stack ends up being, so it stays flush with the inner layout.
	panel := canvas.NewRectangle(tokens.Surface4)
	panel.SetMinSize(fyne.NewSize(tokens.DrawerWidth, 0))
	panel.StrokeColor = tokens.BorderSubtle
	panel.StrokeWidth = 1

	closeBtn := NewIconButton(icons.X, "Close", IconVariantNeutral, d.Close)
	titleText := canvas.NewText(d.title, tokens.TextPrimary)
	titleText.TextSize = 22
	titleText.TextStyle = fyne.TextStyle{Bold: true}

	// Header: title on the left, close on the right. Border puts each at
	// its respective edge with the gap filled by the implicit center area.
	header := container.NewBorder(nil, nil, titleText, closeBtn)
	bodySlot := container.NewStack()

	// Inner content: header on top, scrollable body below. The header is
	// wrapped in an inset (SpaceLG horizontal padding) so the title text
	// and close X don't sit flush against the panel edges. Theme padding
	// alone (SpaceSM = 8px) is too tight for a drawer-sized header.
	headerInset := wrapWithHPadding(header, tokens.SpaceLG)
	bodyInset := wrapWithHPadding(bodySlot, tokens.SpaceLG)
	innerContent := container.NewBorder(
		container.NewPadded(headerInset),
		nil, nil, nil,
		container.NewVScroll(bodyInset),
	)

	// Stack the panel rectangle UNDER the inner content. Both children share
	// the Stack's bounding box, so the dark background always extends exactly
	// to where the header content does — no overflow onto the scrim.
	panelStack := container.NewStack(panel, innerContent)

	scrimTappable := newTappableArea(d.Close)
	rightAnchored := container.NewBorder(nil, nil, nil, panelStack, scrimTappable)

	r := &drawerRenderer{
		drawer:    d,
		scrim:     scrim,
		panel:     panel,
		titleText: titleText,
		closeBtn:  closeBtn,
		bodySlot:  bodySlot,
		root:      rightAnchored,
	}
	r.Refresh() // initial content sync
	return r
}

// wrapWithHPadding adds equal horizontal padding (width px on each side)
// around obj. Used by the drawer to inset the header and body from the
// panel's literal edges. Fyne has no built-in asymmetric padding container,
// so we use Border with transparent spacer rectangles in the left/right slots.
func wrapWithHPadding(obj fyne.CanvasObject, width float32) fyne.CanvasObject {
	left := canvas.NewRectangle(transparent)
	left.SetMinSize(fyne.NewSize(width, 0))
	right := canvas.NewRectangle(transparent)
	right.SetMinSize(fyne.NewSize(width, 0))
	return container.NewBorder(nil, nil, left, right, obj)
}

// DrawerFooter builds the canonical bottom-of-drawer row: a separator above,
// then left (typically Cancel) and right (typically the primary InlineStateButton)
// groups with breathing room above and below. Use it from every drawer body to
// keep button alignment and padding consistent across the app.
func DrawerFooter(left, right []fyne.CanvasObject) fyne.CanvasObject {
	leftBox := container.NewHBox(left...)
	rightBox := container.NewHBox(right...)

	row := container.NewBorder(nil, nil, leftBox, rightBox)

	// Vertical breathing room above + below the button row.
	// Plus a thin separator hint so the footer reads as a distinct strip.
	return container.NewVBox(
		widget.NewSeparator(),
		container.NewPadded(row),
	)
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
