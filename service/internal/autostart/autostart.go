// Package autostart manages automatic launch at user login.
package autostart

// IsEnabled reports whether Quills is configured to start at login.
func IsEnabled() bool {
	return isEnabled()
}

// Enable registers Quills to start at login using the given executable path.
func Enable(exePath string) error {
	return enable(exePath)
}

// Disable removes Quills from the login start configuration.
func Disable() error {
	return disable()
}
