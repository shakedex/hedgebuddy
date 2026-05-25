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
	panel := canvas.NewRectangle(tokens.Surface4)
	panel.SetMinSize(fyne.NewSize(tokens.DrawerWidth, 0))

	closeBtn := NewIconButton(icons.X, "Close", IconVariantNeutral, d.Close)
	titleText := canvas.NewText(d.title, tokens.TextPrimary)
	titleText.TextSize = 22
	titleText.TextStyle = fyne.TextStyle{Bold: true}

	header := container.NewBorder(nil, nil, titleText, closeBtn)
	bodySlot := container.NewStack()
	panelInner := container.NewBorder(
		container.NewPadded(header),
		nil, nil, nil,
		container.NewVScroll(container.NewPadded(bodySlot)),
	)
	panelStack := container.NewStack(panel, panelInner)

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
