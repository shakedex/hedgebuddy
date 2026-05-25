package components

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/icons"
	"app/internal/ui/tokens"
)

// CardRowData is the data passed to the card.
type CardRowData struct {
	Name        string
	Value       string
	Type        string // "string" | "path" | "url" | "secret"
	Description string
}

// CardRowActions wires the row's per-action callbacks.
type CardRowActions struct {
	OnCopy      func()
	OnEdit      func()
	OnDuplicate func()
	OnDelete    func()
}

// CardRow renders a single variable as a rounded card.
// Mouse-in reveals the action icons and lifts the background to Surface3.
type CardRow struct {
	widget.BaseWidget
	data     CardRowData
	actions  CardRowActions
	revealed bool // for secret type: is the value revealed
	hover    bool
}

// NewCardRow builds a card. Call ExtendBaseWidget internally.
func NewCardRow(data CardRowData, actions CardRowActions) *CardRow {
	c := &CardRow{data: data, actions: actions}
	c.ExtendBaseWidget(c)
	return c
}

// SetData updates the card's data and refreshes.
func (c *CardRow) SetData(data CardRowData) {
	c.data = data
	c.Refresh()
}

func (c *CardRow) MouseIn(*fyne.PointEvent)   { c.hover = true; c.Refresh() }
func (c *CardRow) MouseOut()                  { c.hover = false; c.Refresh() }
func (c *CardRow) MouseMoved(*fyne.PointEvent) {}

func (c *CardRow) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(tokens.Surface2)
	bg.CornerRadius = tokens.RadiusCard
	bg.StrokeColor = tokens.BorderSubtle
	bg.StrokeWidth = 1

	stripe := canvas.NewRectangle(tokens.TypeColor(c.data.Type))
	stripe.SetMinSize(fyne.NewSize(3, 0))

	nameText := canvas.NewText(c.data.Name, tokens.TextPrimary)
	nameText.TextSize = 13
	nameText.TextStyle = fyne.TextStyle{Bold: true}

	typeDot := canvas.NewCircle(tokens.TypeColor(c.data.Type))
	typeDot.Resize(fyne.NewSize(6, 6))

	typeLabel := canvas.NewText(c.data.Type, tokens.TypeColor(c.data.Type))
	typeLabel.TextSize = 11

	valueText := widget.NewLabel(c.displayValue())
	valueText.Truncation = fyne.TextTruncateEllipsis
	valueText.TextStyle = fyne.TextStyle{Monospace: true}

	descText := widget.NewLabel(c.data.Description)
	descText.Truncation = fyne.TextTruncateEllipsis
	descText.Importance = widget.LowImportance

	revealBtn := NewIconButton(icons.Eye, "Reveal secret value", IconVariantNeutral, func() {
		c.revealed = !c.revealed
		c.Refresh()
	})
	if c.data.Type != "secret" {
		revealBtn.Hide()
	} else if c.revealed {
		revealBtn.SetIcon(icons.EyeOff)
		revealBtn.SetToolTip("Hide secret value")
	}

	copyBtn := NewIconButton(icons.Copy, "Copy value", IconVariantNeutral, c.actions.OnCopy)
	editBtn := NewIconButton(icons.Pencil, "Edit variable", IconVariantNeutral, c.actions.OnEdit)
	dupBtn := NewIconButton(icons.CopyPlus, "Duplicate variable", IconVariantNeutral, c.actions.OnDuplicate)
	delBtn := NewIconButton(icons.Trash, "Delete variable", IconVariantDanger, c.actions.OnDelete)

	actionRow := container.NewHBox(revealBtn, copyBtn, editBtn, dupBtn, delBtn)
	if !c.hover {
		actionRow.Hide()
	}

	header := container.NewHBox(nameText, container.NewPadded(typeDot), typeLabel, layout.NewSpacer(), actionRow)
	body := container.NewVBox(header, valueText, descText)

	inner := container.NewBorder(nil, nil, stripe, nil, container.NewPadded(body))
	root := container.NewStack(bg, inner)
	root.Resize(fyne.NewSize(0, tokens.CardMinHeight))

	if c.hover {
		bg.FillColor = tokens.Surface3
	}

	return widget.NewSimpleRenderer(root)
}

// Refresh resyncs the renderer to the latest data; for now, force re-create.
func (c *CardRow) Refresh() {
	c.BaseWidget.Refresh()
}

const secretMask = "••••••••"

func (c *CardRow) displayValue() string {
	if c.data.Type == "secret" && !c.revealed {
		return secretMask
	}
	return middleEllipsize(c.data.Value, 80)
}

// middleEllipsize keeps the start and end of long strings, useful for paths.
func middleEllipsize(s string, max int) string {
	if len(s) <= max {
		return s
	}
	if max < 5 {
		return s[:max]
	}
	keep := (max - 1) / 2
	return fmt.Sprintf("%s…%s", s[:keep], s[len(s)-(max-1-keep):])
}
