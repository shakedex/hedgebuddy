package ui

import (
	"fmt"
	"os/exec"
	"runtime"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	"app/internal/profile"
	"app/internal/storage"
	"app/internal/validator"
)

// AppController is the central controller managing navigation and state.
type AppController struct {
	App          fyne.App
	Window       fyne.Window
	Storage      *storage.Storage
	ProfileIndex *profile.ProfileIndex

	// StatusText is the mutable text element displayed in the header's right area.
	// When idle it shows "Variable Manager"; on action it briefly shows a status message.
	StatusText *canvas.Text
}

// NewAppController creates a new controller and loads storage.
func NewAppController(fyneApp fyne.App, window fyne.Window) *AppController {
	statusText := canvas.NewText("", ColorTextMuted)
	statusText.TextSize = 12
	statusText.Alignment = fyne.TextAlignTrailing

	ctrl := &AppController{
		App:        fyneApp,
		Window:     window,
		StatusText: statusText,
	}

	// Run profile migration before loading storage
	if err := profile.Migrate(); err != nil {
		fmt.Println("Warning: profile migration failed:", err.Error())
	}

	// Load profile index
	idx, err := profile.LoadIndex()
	if err != nil || idx == nil {
		// If something went wrong, create a minimal index
		idx = &profile.ProfileIndex{
			Active:   "default",
			Profiles: map[string]profile.ProfileMeta{"default": {Description: "Default profile"}},
		}
	}
	ctrl.ProfileIndex = idx

	// Initialize and load storage for the active profile
	_, err = storage.InitStorage()
	if err != nil {
		fmt.Println("Warning: failed to initialize storage:", err.Error())
	}

	store, err := storage.Load()
	if err != nil {
		store = &storage.Storage{Variables: make(map[string]storage.Variable)}
	}
	ctrl.Storage = store

	// Set window title with active profile
	ctrl.updateWindowTitle()

	return ctrl
}

// ShowStatus flashes a status message in the header, then reverts to the subtitle.
func (c *AppController) ShowStatus(message string) {
	c.StatusText.Text = "✓ " + message
	c.StatusText.Color = ColorSuccess
	c.StatusText.Refresh()

	go func() {
		time.Sleep(time.Duration(StatusDuration) * time.Second)
		c.StatusText.Text = ""
		c.StatusText.Color = ColorTextMuted
		c.StatusText.Refresh()
	}()
}

// Reload reloads variables from disk.
func (c *AppController) Reload() error {
	store, err := storage.Load()
	if err != nil {
		return err
	}
	c.Storage = store
	return nil
}

// wrapView adds consistent outer padding to any view.
func (c *AppController) wrapView(content fyne.CanvasObject) fyne.CanvasObject {
	return container.NewPadded(content)
}

// --- Navigation ---

func (c *AppController) ShowListView() {
	c.Window.SetContent(c.wrapView(NewListView(c)))
}

func (c *AppController) ShowFormView(editingName, prefillName, prefillValue, prefillType, prefillDesc string) {
	c.Window.SetContent(c.wrapView(NewFormView(c, editingName, prefillName, prefillValue, prefillType, prefillDesc)))
}

func (c *AppController) ShowImportView() {
	c.Window.SetContent(c.wrapView(NewImportView(c)))
}

func (c *AppController) ShowExportView() {
	c.Window.SetContent(c.wrapView(NewExportView(c)))
}

func (c *AppController) ShowAboutView() {
	c.Window.SetContent(c.wrapView(NewAboutView(c)))
}

func (c *AppController) ShowProfileView() {
	c.Window.SetContent(c.wrapView(NewProfileView(c)))
}

// SwitchProfile saves current storage, switches active profile, and reloads.
func (c *AppController) SwitchProfile(name string) error {
	// Save current storage first
	if err := c.Storage.Save(); err != nil {
		return err
	}
	// Switch active profile in index
	if err := profile.SetActiveProfile(c.ProfileIndex, name); err != nil {
		return err
	}
	// Reload storage from new profile
	store, err := storage.Load()
	if err != nil {
		return err
	}
	c.Storage = store
	c.updateWindowTitle()
	return nil
}

// updateWindowTitle sets the window title with the active profile name.
func (c *AppController) updateWindowTitle() {
	if c.ProfileIndex.Active == "default" {
		c.Window.SetTitle(WindowTitle)
	} else {
		c.Window.SetTitle(fmt.Sprintf("%s — %s", WindowTitle, c.ProfileIndex.Active))
	}
}

// --- Variable Operations ---

// SaveVariable validates and persists a variable (add or update).
func (c *AppController) SaveVariable(oldName, name, value, varType, description string) error {
	isUpdate := oldName != ""
	if isUpdate && oldName != name {
		c.Storage.DeleteVariable(oldName)
	}
	if err := validator.ValidateVariableName(name); err != nil {
		return err
	}
	if err := validator.ValidateByType(varType, value); err != nil {
		return err
	}
	overwrite := isUpdate
	if err := c.Storage.AddVariable(name, storage.Variable{
		Value:       value,
		Type:        varType,
		Description: description,
	}, overwrite); err != nil {
		return err
	}
	return c.Storage.Save()
}

// DeleteVariable removes a variable and saves.
func (c *AppController) DeleteVariable(name string) error {
	c.Storage.DeleteVariable(name)
	return c.Storage.Save()
}

// ConfirmDelete shows a styled delete confirmation dialog.
func (c *AppController) ConfirmDelete(name string) {
	msgText := canvas.NewText(
		fmt.Sprintf("Are you sure you want to delete '%s'?", name),
		ColorTextSecond,
	)
	msgText.TextSize = 14

	hintText := MutedLabel("This action cannot be undone.")

	d := dialog.NewCustomWithoutButtons(
		"Delete Variable",
		container.NewVBox(msgText, hintText, widget.NewSeparator()),
		c.Window,
	)

	cancelBtn := widget.NewButton("Cancel", func() { d.Hide() })
	deleteBtn := widget.NewButtonWithIcon("Delete", theme.DeleteIcon(), func() {
		d.Hide()
		if err := c.DeleteVariable(name); err != nil {
			dialog.ShowError(err, c.Window)
			return
		}
		c.ShowStatus(fmt.Sprintf("Deleted '%s'", name))
		c.ShowListView()
	})
	deleteBtn.Importance = widget.DangerImportance

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), cancelBtn, deleteBtn})
	d.Show()
}

// DuplicateVariable opens the form pre-filled with a copy of the variable.
func (c *AppController) DuplicateVariable(name string) {
	v, ok := c.Storage.GetVariable(name)
	if !ok {
		return
	}
	copyName := name + "_COPY"
	for counter := 2; ; counter++ {
		if _, exists := c.Storage.GetVariable(copyName); !exists {
			break
		}
		copyName = fmt.Sprintf("%s_COPY%d", name, counter)
	}
	c.ShowFormView("", copyName, v.Value, v.Type, v.Description)
}

// OpenStorageFolder opens the active profile's storage folder in the system file explorer.
func (c *AppController) OpenStorageFolder() {
	path, err := storage.GetStoragePath()
	if err != nil {
		dialog.ShowError(err, c.Window)
		return
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", "/select,", path)
	case "darwin":
		cmd = exec.Command("open", "-R", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	if err := cmd.Start(); err != nil {
		dialog.ShowError(err, c.Window)
	}
}
