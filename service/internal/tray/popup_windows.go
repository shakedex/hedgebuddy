//go:build windows

package tray

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	user32      = syscall.NewLazyDLL("user32.dll")
	messageBoxW = user32.NewProc("MessageBoxW")
)

const (
	mbOK           = 0x00000000
	mbYesNo        = 0x00000004
	mbIconInfo     = 0x00000040
	mbIconQuestion = 0x00000020
	idYes          = 6
)

// showUpdatePopup shows a native popup informing the user an update is
// available and asking whether to launch the updater now.
func showUpdatePopup(app, version string) {
	title, _ := syscall.UTF16PtrFromString("Quills — Update Available")
	msg, _ := syscall.UTF16PtrFromString(
		fmt.Sprintf("%s v%s is available.\n\nWould you like to update now?", app, version),
	)
	ret, _, _ := messageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(msg)),
		uintptr(unsafe.Pointer(title)),
		mbYesNo|mbIconQuestion,
	)
	if ret == idYes {
		launchUpdater(app, version)
	}
}

// showUpToDatePopup shows a native info popup confirming everything is current.
func showUpToDatePopup() {
	title, _ := syscall.UTF16PtrFromString("Quills — Up to Date")
	msg, _ := syscall.UTF16PtrFromString("Everything is up to date!")
	messageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(msg)),
		uintptr(unsafe.Pointer(title)),
		mbOK|mbIconInfo,
	)
}
