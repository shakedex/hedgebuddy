//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

var (
	user32      = syscall.NewLazyDLL("user32.dll")
	messageBoxW = user32.NewProc("MessageBoxW")
)

const (
	mbOKCancel     = 0x00000001
	mbIconQuestion = 0x00000020
	mbIconError    = 0x00000010
	idOK           = 1
)

func confirm(message string) bool {
	title, _ := syscall.UTF16PtrFromString("HedgeBuddy Updater")
	msg, _ := syscall.UTF16PtrFromString(message)
	ret, _, _ := messageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(msg)),
		uintptr(unsafe.Pointer(title)),
		mbOKCancel|mbIconQuestion,
	)
	return ret == idOK
}

func showError(message string) {
	title, _ := syscall.UTF16PtrFromString("HedgeBuddy Updater — Error")
	msg, _ := syscall.UTF16PtrFromString(message)
	messageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(msg)),
		uintptr(unsafe.Pointer(title)),
		mbIconError,
	)
}
