//go:build !windows && !darwin

package diskinv

// Snapshot returns an empty map on unsupported platforms.
func Snapshot() map[string]bool {
	return make(map[string]bool)
}
