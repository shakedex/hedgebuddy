package components

import (
	"fmt"
	"image/color"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/theme"
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
// Action icons are always visible; mouse-in lifts the background to Surface3
// for visual hover feedback.
type CardRow struct {
	widget.BaseWidget
	data     CardRowData
	actions  CardRowActions
	revealed bool // for secret type: is the value revealed
	hover    bool
	flashing bool // briefly true after Flash() to signal save/import
	copied   bool // briefly true after ConfirmCopy() to signal a copy action
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

// ConfirmCopy briefly swaps the copy icon to a check to confirm a copy action.
// Called by the list view's OnCopy callback alongside the actual clipboard write.
func (c *CardRow) ConfirmCopy() {
	c.copied = true
	c.Refresh()
	go func() {
		time.Sleep(1000 * time.Millisecond)
		fyne.Do(func() {
			c.copied = false
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
	valueBg   *canvas.Rectangle
	descText  *widget.Label
	revealBtn *IconButton
	copyBtn   *IconButton
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
	case r.card.hover:
		r.bg.FillColor = tokens.Surface3
	default:
		r.bg.FillColor = tokens.Surface2
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

	// Copy button glyph swap: briefly show a check after a copy action.
	// Tooltip stays at "Copy value" — tooltips only show on a fresh hover
	// delay, so a swap-on-click would never be visible anyway.
	if r.card.copied {
		r.copyBtn.SetIcon(icons.Check)
	} else {
		r.copyBtn.SetIcon(icons.Copy)
	}
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
	valueText.SizeName = theme.SizeNameText // explicit (was implicit)

	// Wrap the value text in a slightly-recessed "code block" background so
	// it reads as the data payload of the card vs. surrounding chrome.
	valueBg := canvas.NewRectangle(tokens.Surface1) // slightly darker than card bg, NOT the app bg
	valueBg.CornerRadius = 4
	valueBlock := container.NewStack(valueBg, container.NewPadded(valueText))

	descText := widget.NewLabel(c.data.Description)
	descText.Truncation = fyne.TextTruncateEllipsis
	descText.Importance = widget.LowImportance
	descText.SizeName = theme.SizeNameCaptionText // smaller than value/header

	revealBtn := NewIconButton(icons.Eye, "Reveal secret value", IconVariantNeutral, func() {
		c.revealed = !c.revealed
		c.Refresh()
	})

	copyBtn := NewIconButton(icons.Copy, "Copy value", IconVariantNeutral, c.actions.OnCopy)
	editBtn := NewIconButton(icons.Pencil, "Edit variable", IconVariantNeutral, c.actions.OnEdit)
	dupBtn := NewIconButton(icons.CopyPlus, "Duplicate variable", IconVariantNeutral, c.actions.OnDuplicate)
	delBtn := NewIconButton(icons.Trash, "Delete variable", IconVariantDanger, c.actions.OnDelete)

	actionRow := container.NewHBox(revealBtn, copyBtn, editBtn, dupBtn, delBtn)

	header := container.NewHBox(cardSpacerH(8), nameText, container.NewPadded(typeDot), typeLabel, layout.NewSpacer(), actionRow, cardSpacerH(8))

	// Match the header's left/right inset on the value & description rows
	// so all content sits 8px inside the card's stripe + right edge.
	valueBlockPadded := container.NewBorder(nil, nil, cardSpacerH(8), cardSpacerH(8), valueBlock)
	descTextPadded := container.NewBorder(nil, nil, cardSpacerH(8), cardSpacerH(8), descText)

	// Compose the card body with a custom tight VBox layout that uses a 1px
	// inter-child gap, plus explicit transparent spacers at top + bottom
	// (4px each). This trims the per-row height vs. Fyne's default VBox
	// (8px theme padding) and the previous 2px/6px configuration.
	body := container.New(&tightVBoxLayout{gap: 1},
		cardSpacer(4), // top breathing space
		header,
		valueBlockPadded,
		descTextPadded,
		cardSpacer(4), // bottom breathing space
	)

	inner := container.NewBorder(nil, nil, stripe, nil, body)
	root := container.NewStack(bg, inner)

	r := &cardRowRenderer{
		card:      c,
		bg:        bg,
		stripe:    stripe,
		nameText:  nameText,
		typeDot:   typeDot,
		typeLabel: typeLabel,
		valueText: valueText,
		valueBg:   valueBg,
		descText:  descText,
		revealBtn: revealBtn,
		copyBtn:   copyBtn,
		actionRow: actionRow,
		root:      root,
	}
	r.Refresh() // initial state sync (background color, reveal-button visibility)
	return r
}

const secretMask = "••••••••"

func (c *CardRow) displayValue() string {
	if c.data.Type == "secret" && !c.revealed {
		return secretMask
	}
	return middleEllipsize(c.data.Value, 80)
}

// tightVBoxLayout lays children vertically with a small fixed gap, replacing
// Fyne's default VBox which uses the theme padding (8 px). Used inside CardRow
// to keep the per-row height compact.
type tightVBoxLayout struct {
	gap float32
}

func (l *tightVBoxLayout) Layout(objs []fyne.CanvasObject, size fyne.Size) {
	y := float32(0)
	for _, obj := range objs {
		if obj == nil || !obj.Visible() {
			continue
		}
		h := obj.MinSize().Height
		obj.Resize(fyne.NewSize(size.Width, h))
		obj.Move(fyne.NewPos(0, y))
		y += h + l.gap
	}
}

func (l *tightVBoxLayout) MinSize(objs []fyne.CanvasObject) fyne.Size {
	var width, height float32
	var visible int
	for _, obj := range objs {
		if obj == nil || !obj.Visible() {
			continue
		}
		visible++
		m := obj.MinSize()
		if m.Width > width {
			width = m.Width
		}
		height += m.Height
	}
	if visible > 1 {
		height += l.gap * float32(visible-1)
	}
	return fyne.NewSize(width, height)
}

// cardSpacer returns a fully transparent CanvasObject with a fixed minimum
// height. Used as a top/bottom padding strip inside CardRow.
func cardSpacer(h float32) fyne.CanvasObject {
	s := canvas.NewRectangle(color.NRGBA{}) // transparent
	s.SetMinSize(fyne.NewSize(0, h))
	return s
}

// cardSpacerH is the horizontal sibling of cardSpacer — a transparent rect
// with a fixed minimum width. Used to inset content inside an HBox without
// pulling in container.NewPadded's 4-side padding.
func cardSpacerH(w float32) fyne.CanvasObject {
	s := canvas.NewRectangle(color.NRGBA{}) // transparent
	s.SetMinSize(fyne.NewSize(w, 0))
	return s
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
