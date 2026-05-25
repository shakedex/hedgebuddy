package components

import (
	"fmt"
	"image/color"
	"time"

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
	flashing bool // briefly true after Flash() to signal save/import
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

func (c *CardRow) MouseIn(*fyne.PointEvent)    { c.hover = true; c.Refresh() }
func (c *CardRow) MouseOut()                   { c.hover = false; c.Refresh() }
func (c *CardRow) MouseMoved(*fyne.PointEvent) {}

// Flash briefly highlights the card to signal that it was just changed.
// Used as part of the no-toast feedback contract for Save/Import operations.
func (c *CardRow) Flash() {
	c.flashing = true
	c.Refresh()
	go func() {
		time.Sleep(800 * time.Millisecond)
		fyne.Do(func() {
			c.flashing = false
			c.Refresh()
		})
	}()
}

// cardRowRenderer is the reactive renderer for CardRow. It holds references to the
// mutable canvas objects (background, stripe, text labels, action row) so that
// Refresh() can re-sync them with the widget's current state.
type cardRowRenderer struct {
	card *CardRow

	bg        *canvas.Rectangle
	stripe    *canvas.Rectangle
	nameText  *canvas.Text
	typeDot   *canvas.Circle
	typeLabel *canvas.Text
	valueText *widget.Label
	descText  *widget.Label
	revealBtn *IconButton
	actionRow *fyne.Container
	root      fyne.CanvasObject
}

func (r *cardRowRenderer) Destroy() {}

func (r *cardRowRenderer) Layout(size fyne.Size) {
	r.root.Resize(size)
}

func (r *cardRowRenderer) MinSize() fyne.Size {
	min := r.root.MinSize()
	if min.Height < tokens.CardMinHeight {
		min.Height = tokens.CardMinHeight
	}
	return min
}

func (r *cardRowRenderer) Objects() []fyne.CanvasObject {
	return []fyne.CanvasObject{r.root}
}

func (r *cardRowRenderer) Refresh() {
	// Background reflects flashing > hover > default priority.
	switch {
	case r.card.flashing:
		// Accent at ~25% alpha — a noticeable wash without being garish.
		r.bg.FillColor = color.NRGBA{R: 0x4F, G: 0x7F, B: 0xF8, A: 0x40}
		r.actionRow.Hide()
	case r.card.hover:
		r.bg.FillColor = tokens.Surface3
		r.actionRow.Show()
	default:
		r.bg.FillColor = tokens.Surface2
		r.actionRow.Hide()
	}
	r.bg.Refresh()

	// Stripe reflects current type.
	r.stripe.FillColor = tokens.TypeColor(r.card.data.Type)
	r.stripe.Refresh()

	// Name + value + description + type label all reflect current data.
	r.nameText.Text = r.card.data.Name
	r.nameText.Refresh()
	r.typeDot.FillColor = tokens.TypeColor(r.card.data.Type)
	r.typeDot.Refresh()
	r.typeLabel.Text = r.card.data.Type
	r.typeLabel.Color = tokens.TypeColor(r.card.data.Type)
	r.typeLabel.Refresh()
	r.valueText.SetText(r.card.displayValue())
	r.descText.SetText(r.card.data.Description)

	// Reveal button visibility + icon for secret rows.
	if r.card.data.Type == "secret" {
		r.revealBtn.Show()
		if r.card.revealed {
			r.revealBtn.SetIcon(icons.EyeOff)
			r.revealBtn.SetToolTip("Hide secret value")
		} else {
			r.revealBtn.SetIcon(icons.Eye)
			r.revealBtn.SetToolTip("Reveal secret value")
		}
	} else {
		r.revealBtn.Hide()
	}

	r.actionRow.Refresh()
}

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

	copyBtn := NewIconButton(icons.Copy, "Copy value", IconVariantNeutral, c.actions.OnCopy)
	editBtn := NewIconButton(icons.Pencil, "Edit variable", IconVariantNeutral, c.actions.OnEdit)
	dupBtn := NewIconButton(icons.CopyPlus, "Duplicate variable", IconVariantNeutral, c.actions.OnDuplicate)
	delBtn := NewIconButton(icons.Trash, "Delete variable", IconVariantDanger, c.actions.OnDelete)

	actionRow := container.NewHBox(revealBtn, copyBtn, editBtn, dupBtn, delBtn)

	header := container.NewHBox(nameText, container.NewPadded(typeDot), typeLabel, layout.NewSpacer(), actionRow)
	body := container.NewVBox(header, valueText, descText)

	inner := container.NewBorder(nil, nil, stripe, nil, container.NewPadded(body))
	root := container.NewStack(bg, inner)

	r := &cardRowRenderer{
		card:      c,
		bg:        bg,
		stripe:    stripe,
		nameText:  nameText,
		typeDot:   typeDot,
		typeLabel: typeLabel,
		valueText: valueText,
		descText:  descText,
		revealBtn: revealBtn,
		actionRow: actionRow,
		root:      root,
	}
	r.Refresh() // initial state sync (e.g. hide actionRow if not hovered)
	return r
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
