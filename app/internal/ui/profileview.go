package ui

import (
	"fmt"
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
	"github.com/ncruces/zenity"

	"app/internal/profile"
)

// NewProfileView creates the profile management view.
func NewProfileView(ctrl *AppController) fyne.CanvasObject {
	header := PageHeader(ctrl, "Manage Profiles")

	profileNames := profile.ListProfiles(ctrl.ProfileIndex)

	listContainer := container.NewVBox()
	scrollable := container.NewVScroll(listContainer)

	var rebuild func()
	rebuild = func() {
		listContainer.Objects = nil
		profileNames = profile.ListProfiles(ctrl.ProfileIndex)

		for _, name := range profileNames {
			pName := name
			meta := ctrl.ProfileIndex.Profiles[pName]
			isActive := pName == ctrl.ProfileIndex.Active

			// Profile name
			nameLabel := canvas.NewText(pName, ColorTextPrimary)
			nameLabel.TextSize = 15
			nameLabel.TextStyle = fyne.TextStyle{Bold: true}

			// Active badge
			var badge fyne.CanvasObject
			if isActive {
				badgeText := canvas.NewText(" ACTIVE ", ColorBgPrimary)
				badgeText.TextSize = 10
				badgeText.TextStyle = fyne.TextStyle{Bold: true}
				badgeBg := canvas.NewRectangle(ColorSuccess)
				badgeBg.SetMinSize(fyne.NewSize(0, 18))
				badge = container.NewStack(badgeBg, container.NewCenter(badgeText))
			} else {
				badge = layout.NewSpacer()
			}

			// Variable count
			varCount := profile.CountVariables(pName)
			countLabel := MutedLabel(fmt.Sprintf("%d variables", varCount))

			// Description
			descLabel := MutedLabel(meta.Description)
			descLabel.TextStyle = fyne.TextStyle{Italic: true}

			// Action buttons
			activateBtn := widget.NewButtonWithIcon("", theme.ConfirmIcon(), func() {
				if err := ctrl.SwitchProfile(pName); err != nil {
					dialog.ShowError(err, ctrl.Window)
					return
				}
				ctrl.ShowStatus(fmt.Sprintf("Switched to '%s'", pName))
				rebuild()
			})
			if isActive {
				activateBtn.Disable()
			}

			editBtn := widget.NewButtonWithIcon("", theme.DocumentCreateIcon(), func() {
				showEditProfileDialog(ctrl, pName, meta, rebuild)
			})

			dupeBtn := widget.NewButtonWithIcon("", theme.ContentPasteIcon(), func() {
				showDuplicateProfileDialog(ctrl, pName, rebuild)
			})

			deleteBtn := widget.NewButtonWithIcon("", theme.DeleteIcon(), func() {
				showDeleteProfileDialog(ctrl, pName, rebuild)
			})
			deleteBtn.Importance = widget.DangerImportance
			if pName == "default" || isActive {
				deleteBtn.Disable()
			}

			topRow := container.NewHBox(nameLabel, badge, layout.NewSpacer(), countLabel, activateBtn, editBtn, dupeBtn, deleteBtn)

			// Card
			bg := canvas.NewRectangle(ColorBgCard)
			var accentColor color.Color
			if isActive {
				accentColor = ColorSuccess
			} else {
				accentColor = ColorBorder
			}
			accent := canvas.NewRectangle(accentColor)
			accent.SetMinSize(fyne.NewSize(4, 0))

			card := container.NewBorder(nil, nil, accent, nil, container.NewPadded(
				container.NewVBox(topRow, descLabel),
			))
			listContainer.Add(container.NewStack(bg, card))
		}
		listContainer.Refresh()
	}
	rebuild()

	// Footer
	newBtn := widget.NewButtonWithIcon("New Profile", theme.ContentAddIcon(), func() {
		showNewProfileDialog(ctrl, rebuild)
	})
	newBtn.Importance = widget.HighImportance

	importBtn := widget.NewButtonWithIcon("Import as Profile", theme.FolderOpenIcon(), func() {
		showImportAsProfileDialog(ctrl, rebuild)
	})

	cancelBtn := widget.NewButtonWithIcon("Back", theme.NavigateBackIcon(), func() {
		ctrl.ShowListView()
	})

	footer := FooterBar(
		[]fyne.CanvasObject{cancelBtn},
		[]fyne.CanvasObject{importBtn, newBtn},
	)

	return container.NewBorder(header, footer, nil, nil, scrollable)
}

func showNewProfileDialog(ctrl *AppController, rebuild func()) {
	nameEntry := widget.NewEntry()
	nameEntry.SetPlaceHolder("Profile name (e.g., client-alpha)")

	descEntry := widget.NewEntry()
	descEntry.SetPlaceHolder("Description (optional)")

	form := container.NewVBox(
		SectionLabel("Name"),
		nameEntry,
		SectionLabel("Description"),
		descEntry,
	)

	d := dialog.NewCustomWithoutButtons("New Profile", form, ctrl.Window)

	cancelBtn := widget.NewButton("Cancel", func() { d.Hide() })
	createBtn := widget.NewButtonWithIcon("Create", theme.ConfirmIcon(), func() {
		name := nameEntry.Text
		if name == "" {
			dialog.ShowError(fmt.Errorf("profile name is required"), ctrl.Window)
			return
		}
		if err := profile.CreateProfile(ctrl.ProfileIndex, name, descEntry.Text); err != nil {
			dialog.ShowError(err, ctrl.Window)
			return
		}
		d.Hide()
		ctrl.ShowStatus(fmt.Sprintf("Created profile '%s'", name))
		rebuild()
	})
	createBtn.Importance = widget.HighImportance

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), cancelBtn, createBtn})
	d.Show()
	ctrl.Window.Canvas().Focus(nameEntry)
}

func showEditProfileDialog(ctrl *AppController, name string, meta profile.ProfileMeta, rebuild func()) {
	descEntry := widget.NewEntry()
	descEntry.SetText(meta.Description)

	var nameEntry *widget.Entry
	var formItems []fyne.CanvasObject

	if name != "default" {
		nameEntry = widget.NewEntry()
		nameEntry.SetText(name)
		formItems = []fyne.CanvasObject{
			SectionLabel("Name"),
			nameEntry,
			SectionLabel("Description"),
			descEntry,
		}
	} else {
		formItems = []fyne.CanvasObject{
			MutedLabel("The default profile cannot be renamed."),
			SectionLabel("Description"),
			descEntry,
		}
	}

	form := container.NewVBox(formItems...)

	d := dialog.NewCustomWithoutButtons("Edit Profile", form, ctrl.Window)

	cancelBtn := widget.NewButton("Cancel", func() { d.Hide() })
	saveBtn := widget.NewButtonWithIcon("Save", theme.DocumentSaveIcon(), func() {
		// Update description
		if err := profile.UpdateDescription(ctrl.ProfileIndex, name, descEntry.Text); err != nil {
			dialog.ShowError(err, ctrl.Window)
			return
		}
		// Rename if changed
		if nameEntry != nil && nameEntry.Text != name {
			if err := profile.RenameProfile(ctrl.ProfileIndex, name, nameEntry.Text); err != nil {
				dialog.ShowError(err, ctrl.Window)
				return
			}
			ctrl.updateWindowTitle()
		}
		d.Hide()
		ctrl.ShowStatus("Profile updated")
		rebuild()
	})
	saveBtn.Importance = widget.HighImportance

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), cancelBtn, saveBtn})
	d.Show()
}

func showDuplicateProfileDialog(ctrl *AppController, srcName string, rebuild func()) {
	nameEntry := widget.NewEntry()
	nameEntry.SetPlaceHolder("New profile name")
	nameEntry.SetText(srcName + "-copy")

	form := container.NewVBox(
		MutedLabel(fmt.Sprintf("Duplicating '%s' with all its variables.", srcName)),
		SectionLabel("New Profile Name"),
		nameEntry,
	)

	d := dialog.NewCustomWithoutButtons("Duplicate Profile", form, ctrl.Window)

	cancelBtn := widget.NewButton("Cancel", func() { d.Hide() })
	dupeBtn := widget.NewButtonWithIcon("Duplicate", theme.ContentPasteIcon(), func() {
		newName := nameEntry.Text
		if newName == "" {
			dialog.ShowError(fmt.Errorf("profile name is required"), ctrl.Window)
			return
		}
		if err := profile.DuplicateProfile(ctrl.ProfileIndex, srcName, newName); err != nil {
			dialog.ShowError(err, ctrl.Window)
			return
		}
		d.Hide()
		ctrl.ShowStatus(fmt.Sprintf("Duplicated '%s' as '%s'", srcName, newName))
		rebuild()
	})
	dupeBtn.Importance = widget.HighImportance

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), cancelBtn, dupeBtn})
	d.Show()
	ctrl.Window.Canvas().Focus(nameEntry)
}

func showDeleteProfileDialog(ctrl *AppController, name string, rebuild func()) {
	msgText := canvas.NewText(
		fmt.Sprintf("Are you sure you want to delete profile '%s'?", name),
		ColorTextSecond,
	)
	msgText.TextSize = 14
	hintText := MutedLabel("This will permanently delete all variables in this profile.")

	d := dialog.NewCustomWithoutButtons("Delete Profile",
		container.NewVBox(msgText, hintText, widget.NewSeparator()),
		ctrl.Window,
	)

	cancelBtn := widget.NewButton("Cancel", func() { d.Hide() })
	deleteBtn := widget.NewButtonWithIcon("Delete", theme.DeleteIcon(), func() {
		d.Hide()
		if err := profile.DeleteProfile(ctrl.ProfileIndex, name); err != nil {
			dialog.ShowError(err, ctrl.Window)
			return
		}
		ctrl.ShowStatus(fmt.Sprintf("Deleted profile '%s'", name))
		rebuild()
	})
	deleteBtn.Importance = widget.DangerImportance

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), cancelBtn, deleteBtn})
	d.Show()
}

func showImportAsProfileDialog(ctrl *AppController, rebuild func()) {
	path, err := zenity.SelectFile(
		zenity.Title("Select JSON template for new profile"),
		zenity.FileFilters{{Name: "JSON files", Patterns: []string{"*.json"}}},
	)
	if err != nil {
		return
	}

	nameEntry := widget.NewEntry()
	nameEntry.SetPlaceHolder("Profile name (e.g., client-beta)")

	descEntry := widget.NewEntry()
	descEntry.SetPlaceHolder("Description (optional)")

	form := container.NewVBox(
		MutedLabel(fmt.Sprintf("Importing from: %s", path)),
		SectionLabel("Profile Name"),
		nameEntry,
		SectionLabel("Description"),
		descEntry,
	)

	d := dialog.NewCustomWithoutButtons("Import as Profile", form, ctrl.Window)

	cancelBtn := widget.NewButton("Cancel", func() { d.Hide() })
	importBtn := widget.NewButtonWithIcon("Import", theme.ConfirmIcon(), func() {
		name := nameEntry.Text
		if name == "" {
			dialog.ShowError(fmt.Errorf("profile name is required"), ctrl.Window)
			return
		}
		if err := profile.ImportAsProfile(ctrl.ProfileIndex, name, descEntry.Text, path); err != nil {
			dialog.ShowError(err, ctrl.Window)
			return
		}
		d.Hide()
		ctrl.ShowStatus(fmt.Sprintf("Imported profile '%s'", name))
		rebuild()
	})
	importBtn.Importance = widget.HighImportance

	d.SetButtons([]fyne.CanvasObject{layout.NewSpacer(), cancelBtn, importBtn})
	d.Show()
	ctrl.Window.Canvas().Focus(nameEntry)
}
