package ui

import (
	"fmt"
	"os/exec"
	"runtime"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	fynetooltip "github.com/dweymouth/fyne-tooltip"

	"app/internal/profile"
	"app/internal/storage"
	"app/internal/ui/components"
	"app/internal/ui/tokens"
	"app/internal/validator"
)

// AppController is the central controller managing shell state, navigation, and storage.
type AppController struct {
	App          fyne.App
	Window       fyne.Window
	Storage      *storage.Storage
	ProfileIndex *profile.ProfileIndex

	// Shell components
	sidebar  *components.Sidebar
	mainPane *fyne.Container
	drawer   *components.Drawer

	// Filter state
	activeFilter string // "" | "string" | "path" | "url" | "secret"
}

// NewAppController initializes storage, profile index, and the shell layout.
func NewAppController(fyneApp fyne.App, window fyne.Window) *AppController {
	ctrl := &AppController{
		App:    fyneApp,
		Window: window,
	}

	if err := profile.Migrate(); err != nil {
		fmt.Println("Warning: profile migration failed:", err.Error())
	}

	idx, err := profile.LoadIndex()
	if err != nil || idx == nil {
		idx = &profile.ProfileIndex{
			Active:   "default",
			Profiles: map[string]profile.ProfileMeta{"default": {Description: "Default profile"}},
		}
	}
	ctrl.ProfileIndex = idx

	if _, err := storage.InitStorage(); err != nil {
		fmt.Println("Warning: failed to initialize storage:", err.Error())
	}

	store, err := storage.Load()
	if err != nil {
		store = &storage.Storage{Variables: make(map[string]storage.Variable)}
	}
	ctrl.Storage = store

	ctrl.updateWindowTitle()
	ctrl.buildShell()

	return ctrl
}

func (c *AppController) buildShell() {
	c.mainPane = container.NewStack()
	c.drawer = components.NewDrawer()

	c.rebuildSidebar()
	c.renderList()

	shellBody := container.NewBorder(
		nil, nil,
		c.sidebar, nil,
		c.mainPane,
	)

	overlay := container.NewStack(shellBody, c.drawer)
	c.Window.SetContent(fynetooltip.AddWindowToolTipLayer(overlay, c.Window.Canvas()))

	// Esc closes drawer.
	c.Window.Canvas().SetOnTypedKey(func(e *fyne.KeyEvent) {
		if e.Name == fyne.KeyEscape && c.drawer.IsOpen() {
			c.drawer.Close()
		}
	})
}

// --- Drawer control ---

// OpenDrawer shows a right-side drawer with the given title and body.
func (c *AppController) OpenDrawer(title string, body fyne.CanvasObject, onClose func()) {
	c.drawer.Open(title, body, onClose)
}

// CloseDrawer hides the drawer.
func (c *AppController) CloseDrawer() {
	c.drawer.Close()
}

// --- Filter control ---

// SetFilter sets the active type filter (or "" for all) and re-renders the list.
func (c *AppController) SetFilter(typeName string) {
	c.activeFilter = typeName
	c.rebuildSidebar()
	c.renderList()
}

// --- Storage / profile ops (unchanged from before) ---

func (c *AppController) Reload() error {
	store, err := storage.Load()
	if err != nil {
		return err
	}
	c.Storage = store
	return nil
}

func (c *AppController) SwitchProfile(name string) error {
	if err := c.Storage.Save(); err != nil {
		return err
	}
	if err := profile.SetActiveProfile(c.ProfileIndex, name); err != nil {
		return err
	}
	store, err := storage.Load()
	if err != nil {
		return err
	}
	c.Storage = store
	c.updateWindowTitle()
	c.rebuildSidebar()
	c.renderList()
	return nil
}

func (c *AppController) updateWindowTitle() {
	if c.ProfileIndex.Active == "default" {
		c.Window.SetTitle(WindowTitle)
	} else {
		c.Window.SetTitle(fmt.Sprintf("%s — %s", WindowTitle, c.ProfileIndex.Active))
	}
}

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

func (c *AppController) DeleteVariable(name string) error {
	c.Storage.DeleteVariable(name)
	return c.Storage.Save()
}

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
	if err := c.Storage.AddVariable(copyName, storage.Variable{
		Value:       v.Value,
		Type:        v.Type,
		Description: v.Description,
	}, false); err != nil {
		dialog.ShowError(err, c.Window)
		return
	}
	_ = c.Storage.Save()
	c.renderList()
}

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

// silence unused import in this slice
var _ = tokens.SpaceSM

// --- Stubs filled by later tasks ---

// rebuildSidebar will be implemented in Task 16. Stub for now.
func (c *AppController) rebuildSidebar() {
	c.sidebar = components.NewSidebar(nil, nil)
}

// renderList will be implemented in Task 17. Stub renders an empty message for now.
func (c *AppController) renderList() {
	placeholder := widget.NewLabel("List view under reconstruction")
	c.mainPane.Objects = []fyne.CanvasObject{placeholder}
	c.mainPane.Refresh()
}

// ShowListView is kept for legacy callers (main.go invokes it).
func (c *AppController) ShowListView() {
	c.renderList()
}

// --- Forward stubs (real implementations land in later tasks) ---

type ProfileModalMode int

const (
	ProfileModalModeNew ProfileModalMode = iota
	ProfileModalModeEdit
	ProfileModalModeDuplicate
	ProfileModalModeImport
)

func ShowProfileFormModal(*AppController, ProfileModalMode, string) {}
func confirmDeleteProfile(*AppController, string)                    {}
func ShowSettingsModal(*AppController)                               {}
func ShowAboutModal(*AppController)                                  {}
func ShowEditDrawer(*AppController, string)                          {}
func ShowImportDrawer(*AppController)                                {}
func ShowExportDrawer(*AppController)                                {}
