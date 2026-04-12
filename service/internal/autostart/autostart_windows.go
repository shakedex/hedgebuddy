//go:build windows

package autostart

import (
	"os"

	"golang.org/x/sys/windows/registry"
)

const registryKey = `Software\Microsoft\Windows\CurrentVersion\Run`
const valueName = "Quills"

func isEnabled() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, registryKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()

	_, _, err = k.GetStringValue(valueName)
	return err == nil
}

func enable(exePath string) error {
	k, err := registry.OpenKey(registry.CURRENT_USER, registryKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()

	// Quote the path and add -no-browser so it starts silently in the tray.
	return k.SetStringValue(valueName, `"`+exePath+`" -no-browser`)
}

func disable() error {
	k, err := registry.OpenKey(registry.CURRENT_USER, registryKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()

	err = k.DeleteValue(valueName)
	if err == registry.ErrNotExist || os.IsNotExist(err) {
		return nil
	}
	return err
}
