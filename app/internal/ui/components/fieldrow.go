package components

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/tokens"
)

// FieldRow is a labeled form field that renders as label / entry / inline error.
// Phase 1 ships the visual structure; Phase 2 wires Entry.Validator for live errors.
type FieldRow struct {
	label    *canvas.Text
	entry    *widget.Entry
	errText  *canvas.Text
	root     fyne.CanvasObject
	trailing fyne.CanvasObject // optional, e.g. Browse buttons for path
}

// NewFieldRow builds a FieldRow with a plain Entry. Use NewPasswordFieldRow for secrets.
func NewFieldRow(label string, entry *widget.Entry, trailing fyne.CanvasObject) *FieldRow {
	labelText := canvas.NewText(label, tokens.TextPrimary)
	labelText.TextSize = 16
	labelText.TextStyle = fyne.TextStyle{Bold: true}

	errText := canvas.NewText("", tokens.Danger)
	errText.TextSize = 11
	errText.Hide()

	f := &FieldRow{label: labelText, entry: entry, errText: errText, trailing: trailing}

	var entryBox fyne.CanvasObject = entry
	if trailing != nil {
		entryBox = container.NewBorder(nil, nil, nil, trailing, entry)
	}

	f.root = container.NewVBox(labelText, entryBox, errText)
	return f
}

// Object exposes the renderable.
func (f *FieldRow) Object() fyne.CanvasObject { return f.root }

// Entry exposes the underlying entry for value/placeholder updates.
func (f *FieldRow) Entry() *widget.Entry { return f.entry }

// SetError shows or hides the inline error caption.
func (f *FieldRow) SetError(msg string) {
	if msg == "" {
		f.errText.Hide()
		return
	}
	f.errText.Text = msg
	f.errText.Show()
	f.errText.Refresh()
}
