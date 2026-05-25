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

func (i *SidebarItem) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(tokens.Surface1)
	bg.CornerRadius = tokens.RadiusSidebarItem
	switch {
	case i.active:
		bg.FillColor = tokens.Surface3
	case i.hover:
		bg.FillColor = tokens.Surface2
	}

	stripe := canvas.NewRectangle(tokens.Accent)
	stripe.SetMinSize(fyne.NewSize(2, 0))
	if !i.active {
		stripe.FillColor = tokens.Surface1 // invisible
	}

	labelText := canvas.NewText(i.label, tokens.TextPrimary)
	labelText.TextSize = 13
	if i.active {
		labelText.TextStyle = fyne.TextStyle{Bold: true}
	}

	row := container.NewHBox(labelText)
	if i.count != nil {
		countText := canvas.NewText(fmt.Sprintf("%d", *i.count), tokens.TextMuted)
		countText.TextSize = 11
		countText.Alignment = fyne.TextAlignTrailing
		row = container.NewHBox(labelText, layout.NewSpacer(), countText)
	}

	inner := container.NewBorder(nil, nil, stripe, nil, container.NewPadded(row))
	stack := container.NewStack(bg, inner)
	stack.Resize(fyne.NewSize(tokens.SidebarWidth-tokens.SpaceSM*2, 32))
	return widget.NewSimpleRenderer(stack)
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
}

func NewSidebar(sections []SidebarSection, footer []fyne.CanvasObject) *Sidebar {
	s := &Sidebar{sections: sections, footer: footer}
	s.ExtendBaseWidget(s)
	return s
}

func (s *Sidebar) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(tokens.Surface1)
	bg.SetMinSize(fyne.NewSize(tokens.SidebarWidth, 0))

	var sectionBoxes []fyne.CanvasObject
	for _, sec := range s.sections {
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

		items := container.NewVBox(sec.Items...)
		sectionBoxes = append(sectionBoxes, container.NewVBox(header, items))
	}

	body := container.NewVBox(sectionBoxes...)

	var footerBox fyne.CanvasObject
	if len(s.footer) > 0 {
		footerBox = container.NewVBox(s.footer...)
	}

	root := container.NewBorder(
		nil, footerBox, nil, nil,
		container.NewVScroll(container.NewPadded(body)),
	)

	return widget.NewSimpleRenderer(container.NewStack(bg, root))
}
