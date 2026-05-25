package ui

import (
	"image/color"
	"strings"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/components"
	"app/internal/ui/icons"
	"app/internal/ui/tokens"
)

// newListSpacer is a fully transparent rectangle with a fixed minimum size.
// Used to inset the scrolling card list from the scroll viewport edges (esp.
// to keep cards' right edges off the scrollbar gutter).
func newListSpacer(w, h float32) fyne.CanvasObject {
	r := canvas.NewRectangle(color.NRGBA{})
	r.SetMinSize(fyne.NewSize(w, h))
	return r
}

// buildListView builds the main pane content: search header + variable cards.
// Returns the root canvas object that should be placed in c.mainPane.
func (c *AppController) buildListView() fyne.CanvasObject {
	searchEntry := widget.NewEntry()
	searchEntry.SetPlaceHolder("Search variables")
	// Try to use the leading-icon API (Fyne 2.5+); ignore if missing.
	type iconSettable interface {
		SetIcon(fyne.Resource)
	}
	if s, ok := any(searchEntry).(iconSettable); ok {
		s.SetIcon(icons.Search)
	}

	newBtn := widget.NewButtonWithIcon("New", icons.Plus, func() {
		ShowEditDrawer(c, "")
	})
	newBtn.Importance = widget.HighImportance

	importBtn := widget.NewButtonWithIcon("Import", icons.Download, func() {
		ShowImportDrawer(c)
	})
	exportBtn := widget.NewButtonWithIcon("Export", icons.Upload, func() {
		ShowExportDrawer(c)
	})

	rightSide := container.NewHBox(importBtn, exportBtn, newBtn)
	header := container.NewBorder(nil, nil, nil, rightSide, searchEntry)

	listContainer := container.NewVBox()
	// Use a manual Border instead of container.NewPadded so we can leave an
	// asymmetric right inset wide enough for the vertical scrollbar gutter.
	scroll := container.NewVScroll(container.NewBorder(
		newListSpacer(0, 8),  // top
		newListSpacer(0, 8),  // bottom
		newListSpacer(8, 0),  // left
		newListSpacer(16, 0), // right — extra space for the scrollbar
		listContainer,
	))

	render := func() {
		listContainer.Objects = nil
		query := strings.ToLower(searchEntry.Text)
		matched := c.filteredKeys(query)

		// Drain pending flashes once per render. Cards whose names match
		// will flash briefly after they're mounted.
		flashSet := c.consumeFlash()

		if len(matched) == 0 {
			emptyLabel := widget.NewLabel(c.emptyStateMessage(query))
			emptyLabel.Alignment = fyne.TextAlignCenter
			emptyLabel.Importance = widget.LowImportance
			listContainer.Add(layout.NewSpacer())
			listContainer.Add(emptyLabel)
			listContainer.Add(layout.NewSpacer())
			listContainer.Refresh()
			return
		}

		firstFlashIndex := -1
		for i, name := range matched {
			n := name
			v, _ := c.Storage.GetVariable(n)
			var card *components.CardRow
			card = components.NewCardRow(
				components.CardRowData{
					Name:        n,
					Value:       v.Value,
					Type:        v.Type,
					Description: v.Description,
				},
				components.CardRowActions{
					OnCopy: func() {
						c.Window.Clipboard().SetContent(v.Value)
						if card != nil {
							card.ConfirmCopy()
							card.Flash()
						}
					},
					OnEdit:      func() { ShowEditDrawer(c, n) },
					OnDuplicate: func() { c.DuplicateVariable(n) },
					OnDelete:    func() { c.confirmDeleteVariable(n) },
				},
			)
			listContainer.Add(card)
			if _, ok := flashSet[n]; ok {
				card.Flash()
				if firstFlashIndex == -1 {
					firstFlashIndex = i
				}
			}
		}
		listContainer.Refresh()

		// Auto-scroll to first flashed row, if any. Deferred to fyne.Do so the
		// scroll widget is mounted to the canvas before we move its offset —
		// otherwise Fyne resets to (0,0) on mount.
		if firstFlashIndex >= 0 {
			rowHeight := tokens.CardMinHeight + tokens.SpaceSM
			target := float32(firstFlashIndex) * rowHeight
			go func() {
				time.Sleep(50 * time.Millisecond)
				fyne.Do(func() {
					scroll.Offset = fyne.NewPos(0, target)
					scroll.Refresh()
				})
			}()
		}
	}

	searchEntry.OnChanged = func(string) { render() }

	render()

	return container.NewBorder(container.NewPadded(header), nil, nil, nil, scroll)
}

// filteredKeys returns sorted variable names matching the search query and active filter.
func (c *AppController) filteredKeys(query string) []string {
	keys := c.Storage.GetSortedKeys()
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		v, _ := c.Storage.GetVariable(k)
		if c.activeFilter != "" && v.Type != c.activeFilter {
			continue
		}
		if query != "" {
			hay := strings.ToLower(k + " " + v.Value + " " + v.Description + " " + v.Type)
			if !strings.Contains(hay, query) {
				continue
			}
		}
		out = append(out, k)
	}
	return out
}

func (c *AppController) emptyStateMessage(query string) string {
	switch {
	case query != "" && c.activeFilter != "":
		return "No " + c.activeFilter + " variables match '" + query + "'."
	case query != "":
		return "No variables match '" + query + "'."
	case c.activeFilter != "":
		return "No " + c.activeFilter + " variables yet."
	case len(c.Storage.Variables) == 0:
		return "No variables yet. Click '+ New' to add your first variable."
	default:
		return "No variables to show."
	}
}

// confirmDeleteVariable opens the redesigned delete confirmation modal.
func (c *AppController) confirmDeleteVariable(name string) {
	components.ShowDeleteConfirm(components.DeleteConfirmOptions{
		TargetName: name,
		BodyText:   "This can't be undone.",
		OnConfirm: func() {
			if err := c.DeleteVariable(name); err != nil {
				// Phase 2 surfaces this via InlineStateButton.error; for Phase 1 we accept the modal close + silent failure path.
				_ = err
				return
			}
			c.rebuildSidebar()
			c.renderList()
		},
		Parent: c.Window,
	})
}
