//go:build !windows && !darwin

package autostart

func isEnabled() bool {
	return false
}

func enable(_ string) error {
	return nil
}

func disable() error {
	return nil
}
