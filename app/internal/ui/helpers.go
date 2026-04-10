package ui

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"
	ttwidget "github.com/dweymouth/fyne-tooltip/widget"
)

// --- Page Header ---

// PageHeader builds the common header bar for sub-views (import, export, form, about).
// Title is displayed left-aligned as the view name.
func PageHeader(ctrl *AppController, title string) fyne.CanvasObject {
	titleText := canvas.NewText(title, ColorAccentBlue)
	titleText.TextSize = 22
	titleText.TextStyle = fyne.TextStyle{Bold: true}

	return container.NewVBox(
		container.NewHBox(titleText),
		widget.NewSeparator(),
	)
}

// --- Footer Bar ---

// FooterBar creates a consistent footer with left and right action groups.
func FooterBar(left []fyne.CanvasObject, right []fyne.CanvasObject) fyne.CanvasObject {
	var leftBox, rightBox fyne.CanvasObject
	if len(left) > 0 {
		leftBox = container.NewHBox(left...)
	}
	if len(right) > 0 {
		rightBox = container.NewHBox(right...)
	}
	return container.NewVBox(
		widget.NewSeparator(),
		container.NewBorder(nil, nil, leftBox, rightBox),
	)
}

// --- Section Labels ---

// SectionLabel creates a styled bold label used as form section heading.
func SectionLabel(text string) *canvas.Text {
	l := canvas.NewText(text, ColorTextPrimary)
	l.TextSize = 14
	l.TextStyle = fyne.TextStyle{Bold: true}
	return l
}

// MutedLabel creates a small muted text (hints, captions).
func MutedLabel(text string) *canvas.Text {
	l := canvas.NewText(text, ColorTextMuted)
	l.TextSize = 12
	return l
}

// --- Select All / Deselect All ---

// --- Tooltip Button ---

// newTooltipButton creates an icon button that shows a tooltip on hover.
func newTooltipButton(label string, icon fyne.Resource, tooltip string, tapped func()) *ttwidget.Button {
	btn := ttwidget.NewButtonWithIcon(label, icon, tapped)
	btn.SetToolTip(tooltip)
	return btn
}

// newIconTooltipButton creates an icon-only button with a tooltip.
func newIconTooltipButton(icon fyne.Resource, tooltip string, tapped func()) *ttwidget.Button {
	btn := ttwidget.NewButtonWithIcon("", icon, tapped)
	btn.SetToolTip(tooltip)
	return btn
}

// SelectionButtons creates a pair of Select All / Deselect All buttons
// wired to the given checkbox map.
func SelectionButtons(checkboxes map[string]*widget.Check) (selectAll, deselectAll *widget.Button) {
	selectAll = widget.NewButton("Select All", func() {
		for _, cb := range checkboxes {
			cb.SetChecked(true)
		}
	})
	deselectAll = widget.NewButton("Deselect All", func() {
		for _, cb := range checkboxes {
			cb.SetChecked(false)
		}
	})
	return
}

// --- Type Badge ---

// TypeBadge creates a colored type label like [path] [url] [secret].
func TypeBadge(varType string) *canvas.Text {
	badge := canvas.NewText("["+varType+"]", TypeColor(varType))
	badge.TextSize = 11
	badge.TextStyle = fyne.TextStyle{Bold: true}
	return badge
}

// --- Checkbox Card ---

// CheckboxCard builds a card with a checkbox, type badge, and optional warning.
// Used in both import and export views.
func CheckboxCard(name, varType string, warning string) (*widget.Check, fyne.CanvasObject) {
	check := widget.NewCheck(name, nil)
	check.SetChecked(true)
	row := container.NewHBox(check, TypeBadge(varType))
	if warning != "" {
		warnText := canvas.NewText("  "+warning, ColorWarning)
		warnText.TextSize = 11
		row.Add(warnText)
	}
	bg := canvas.NewRectangle(ColorBgCard)
	card := container.NewStack(bg, container.NewPadded(row))
	return check, card
}

// --- Empty State ---

// EmptyState creates a centered empty-state placeholder.
// If iconRes is nil, the app icon (hedgehog) is used.
func EmptyState(iconRes fyne.Resource, message, hint string, actions ...fyne.CanvasObject) fyne.CanvasObject {
	var icon fyne.CanvasObject
	if iconRes != nil {
		img := widget.NewIcon(iconRes)
		icon = container.NewCenter(img)
	} else {
		img := canvas.NewImageFromResource(AppIcon())
		img.FillMode = canvas.ImageFillContain
		img.SetMinSize(fyne.NewSize(64, 64))
		icon = img
	}

	msgLabel := widget.NewLabel(message)
	msgLabel.Alignment = fyne.TextAlignCenter
	msgLabel.TextStyle = fyne.TextStyle{Bold: true}

	hintLabel := widget.NewLabel(hint)
	hintLabel.Alignment = fyne.TextAlignCenter
	hintLabel.Importance = widget.LowImportance

	items := []fyne.CanvasObject{
		layout.NewSpacer(),
		container.NewCenter(icon),
		msgLabel,
		hintLabel,
	}
	if len(actions) > 0 {
		items = append(items, container.NewCenter(container.NewHBox(actions...)))
	}
	items = append(items, layout.NewSpacer())
	return container.NewVBox(items...)
}
