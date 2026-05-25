package components

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/tokens"
)

// SidebarItem is a single tappable row in the sidebar.
type SidebarItem struct {
	widget.BaseWidget
	label  string
	count  *int // nil = no count shown
	active bool
	hover  bool
	onTap  func()
}

func NewSidebarItem(label string, count *int, active bool, onTap func()) *SidebarItem {
	i := &SidebarItem{label: label, count: count, active: active, onTap: onTap}
	i.ExtendBaseWidget(i)
	return i
}

func (i *SidebarItem) SetActive(active bool) { i.active = active; i.Refresh() }
func (i *SidebarItem) SetCount(c int)        { i.count = &c; i.Refresh() }
func (i *SidebarItem) Tapped(*fyne.PointEvent) {
	if i.onTap != nil {
		i.onTap()
	}
}
func (i *SidebarItem) MouseIn(*fyne.PointEvent)    { i.hover = true; i.Refresh() }
func (i *SidebarItem) MouseOut()                   { i.hover = false; i.Refresh() }
func (i *SidebarItem) MouseMoved(*fyne.PointEvent) {}

// sidebarItemRenderer is the reactive renderer for SidebarItem.
type sidebarItemRenderer struct {
	item      *SidebarItem
	bg        *canvas.Rectangle
	stripe    *canvas.Rectangle
	labelText *canvas.Text
	countText *canvas.Text
	row       *fyne.Container
	root      fyne.CanvasObject
}

func (r *sidebarItemRenderer) Destroy()                     {}
func (r *sidebarItemRenderer) Layout(s fyne.Size)           { r.root.Resize(s) }
func (r *sidebarItemRenderer) MinSize() fyne.Size           { return r.root.MinSize() }
func (r *sidebarItemRenderer) Objects() []fyne.CanvasObject { return []fyne.CanvasObject{r.root} }

func (r *sidebarItemRenderer) Refresh() {
	switch {
	case r.item.active:
		r.bg.FillColor = tokens.Surface3
		r.stripe.FillColor = tokens.Accent
		r.labelText.TextStyle = fyne.TextStyle{Bold: true}
	case r.item.hover:
		r.bg.FillColor = tokens.Surface2
		r.stripe.FillColor = tokens.Surface1
		r.labelText.TextStyle = fyne.TextStyle{}
	default:
		r.bg.FillColor = tokens.Surface1
		r.stripe.FillColor = tokens.Surface1
		r.labelText.TextStyle = fyne.TextStyle{}
	}
	r.bg.Refresh()
	r.stripe.Refresh()
	r.labelText.Text = r.item.label
	r.labelText.Refresh()

	if r.item.count != nil && r.countText != nil {
		r.countText.Text = fmt.Sprintf("%d", *r.item.count)
		r.countText.Show()
		r.countText.Refresh()
	} else if r.countText != nil {
		r.countText.Hide()
	}
}

func (i *SidebarItem) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(tokens.Surface1)
	bg.CornerRadius = tokens.RadiusSidebarItem

	stripe := canvas.NewRectangle(tokens.Surface1)
	stripe.SetMinSize(fyne.NewSize(2, 0))

	labelText := canvas.NewText(i.label, tokens.TextPrimary)
	labelText.TextSize = 13

	var countText *canvas.Text
	var row *fyne.Container
	if i.count != nil {
		countText = canvas.NewText(fmt.Sprintf("%d", *i.count), tokens.TextMuted)
		countText.TextSize = 11
		countText.Alignment = fyne.TextAlignTrailing
		row = container.NewHBox(labelText, layout.NewSpacer(), countText)
	} else {
		row = container.NewHBox(labelText)
	}

	inner := container.NewBorder(nil, nil, stripe, nil, container.NewPadded(row))
	root := container.NewStack(bg, inner)

	r := &sidebarItemRenderer{
		item:      i,
		bg:        bg,
		stripe:    stripe,
		labelText: labelText,
		countText: countText,
		row:       row,
		root:      root,
	}
	r.Refresh()
	return r
}

// Sidebar renders a vertical column with sections of items and a footer.
type Sidebar struct {
	widget.BaseWidget
	sections []SidebarSection
	footer   []fyne.CanvasObject
}

// SidebarSection is a labeled group of items (with optional trailing add button).
type SidebarSection struct {
	Title string
	Items []fyne.CanvasObject
	OnAdd func() // if non-nil, renders a `+` button in the section header
	// Composer, if non-nil, is rendered as the first row below the section header.
	// Used for inline-add affordances (e.g., New profile name entry).
	Composer fyne.CanvasObject
}

func NewSidebar(sections []SidebarSection, footer []fyne.CanvasObject) *Sidebar {
	s := &Sidebar{sections: sections, footer: footer}
	s.ExtendBaseWidget(s)
	return s
}

// Rebuild swaps the sections + footer in place; the renderer's Refresh picks up the change.
// Use this on subsequent rebuilds so the widget keeps its mount and identity.
func (s *Sidebar) Rebuild(sections []SidebarSection, footer []fyne.CanvasObject) {
	s.sections = sections
	s.footer = footer
	s.Refresh()
}

// sidebarRenderer is the reactive renderer for Sidebar. It owns the body + footer
// containers and rebuilds their children from the widget's current sections on Refresh.
type sidebarRenderer struct {
	sidebar *Sidebar
	bg      *canvas.Rectangle
	body    *fyne.Container // VBox that holds section UI
	footer  *fyne.Container
	root    fyne.CanvasObject
}

func (r *sidebarRenderer) Destroy()                     {}
func (r *sidebarRenderer) Layout(s fyne.Size)           { r.root.Resize(s) }
func (r *sidebarRenderer) MinSize() fyne.Size           { return r.root.MinSize() }
func (r *sidebarRenderer) Objects() []fyne.CanvasObject { return []fyne.CanvasObject{r.root} }

func (r *sidebarRenderer) Refresh() {
	// Rebuild body content from current sections.
	r.body.Objects = nil
	for _, sec := range r.sidebar.sections {
		title := canvas.NewText(sec.Title, tokens.TextMuted)
		title.TextSize = 11
		title.TextStyle = fyne.TextStyle{Bold: true}

		var header fyne.CanvasObject
		if sec.OnAdd != nil {
			addBtn := widget.NewButton("+", sec.OnAdd)
			addBtn.Importance = widget.LowImportance
			header = container.NewBorder(nil, nil, title, addBtn)
		} else {
			header = container.NewHBox(title)
		}

		sectionBody := container.NewVBox(header)
		if sec.Composer != nil {
			sectionBody.Add(sec.Composer)
		}
		sectionBody.Add(container.NewVBox(sec.Items...))
		r.body.Add(sectionBody)
	}
	r.body.Refresh()

	// Footer.
	r.footer.Objects = nil
	for _, obj := range r.sidebar.footer {
		r.footer.Add(obj)
	}
	r.footer.Refresh()
}

func (s *Sidebar) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(tokens.Surface1)
	bg.SetMinSize(fyne.NewSize(tokens.SidebarWidth, 0))

	body := container.NewVBox()
	footer := container.NewVBox()

	root := container.NewBorder(
		nil, footer, nil, nil,
		container.NewVScroll(container.NewPadded(body)),
	)
	rootWithBg := container.NewStack(bg, root)

	r := &sidebarRenderer{
		sidebar: s,
		bg:      bg,
		body:    body,
		footer:  footer,
		root:    rootWithBg,
	}
	r.Refresh()
	return r
}
