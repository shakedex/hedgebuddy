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
	"app/internal/ui/icons"
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

// --- Stubs filled by later tasks ---

func (c *AppController) rebuildSidebar() {
	// Profiles section.
	profileNames := profile.ListProfiles(c.ProfileIndex)
	var profileItems []fyne.CanvasObject
	for _, name := range profileNames {
		pName := name
		count := profile.CountVariables(pName)
		active := pName == c.ProfileIndex.Active

		item := components.NewSidebarItem(pName, &count, active, func() {
			if pName == c.ProfileIndex.Active {
				return
			}
			if err := c.SwitchProfile(pName); err != nil {
				dialog.ShowError(err, c.Window)
				return
			}
		})

		menuBtn := components.NewIconButton(icons.Ellipsis, "Profile actions", components.IconVariantNeutral, nil)
		menuBtn.OnTapped = func() {
			showProfileRowMenu(c, pName, menuBtn)
		}
		row := container.NewBorder(nil, nil, nil, menuBtn, item)
		profileItems = append(profileItems, row)
	}

	profilesSection := components.SidebarSection{
		Title: "PROFILES",
		Items: profileItems,
		OnAdd: func() {
			ShowProfileFormModal(c, ProfileModalModeNew, "")
		},
	}

	// Filters section.
	all := len(c.Storage.Variables)
	counts := map[string]int{"string": 0, "path": 0, "url": 0, "secret": 0}
	for _, v := range c.Storage.Variables {
		counts[v.Type]++
	}

	filtersData := []struct {
		Label string
		Key   string
		Count int
	}{
		{"All", "", all},
		{"String", "string", counts["string"]},
		{"Path", "path", counts["path"]},
		{"URL", "url", counts["url"]},
		{"Secret", "secret", counts["secret"]},
	}

	var filterItems []fyne.CanvasObject
	for _, f := range filtersData {
		fKey := f.Key
		fCount := f.Count
		active := c.activeFilter == fKey
		filterItems = append(filterItems,
			components.NewSidebarItem(f.Label, &fCount, active, func() {
				c.SetFilter(fKey)
			}),
		)
	}

	filtersSection := components.SidebarSection{
		Title: "FILTERS",
		Items: filterItems,
	}

	// Footer.
	settingsBtn := widget.NewButtonWithIcon("Settings", icons.Settings, func() {
		ShowSettingsModal(c)
	})
	settingsBtn.Alignment = widget.ButtonAlignLeading
	settingsBtn.Importance = widget.LowImportance

	aboutBtn := widget.NewButtonWithIcon("About", icons.Info, func() {
		ShowAboutModal(c)
	})
	aboutBtn.Alignment = widget.ButtonAlignLeading
	aboutBtn.Importance = widget.LowImportance

	footer := []fyne.CanvasObject{settingsBtn, aboutBtn}

	c.sidebar = components.NewSidebar(
		[]components.SidebarSection{profilesSection, filtersSection},
		footer,
	)
}

func (c *AppController) renderList() {
	c.mainPane.Objects = []fyne.CanvasObject{c.buildListView()}
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

func ShowAboutModal(*AppController) {}
