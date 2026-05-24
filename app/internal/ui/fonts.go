package ui

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"fyne.io/fyne/v2"
)

// LoadOSFonts attempts to load OS-native fonts.
// Returns (regular, bold). Either or both may be nil if loading fails.
// The HedgeBuddyTheme falls back to Fyne's default font for any nil result.
func LoadOSFonts() (fyne.Resource, fyne.Resource) {
	regularPath, boldPath := osFontPaths()
	return loadFontsFromPaths(regularPath, boldPath)
}

// osFontPaths returns the platform-specific font file paths.
func osFontPaths() (regular, bold string) {
	switch runtime.GOOS {
	case "windows":
		sysRoot := os.Getenv("SystemRoot")
		if sysRoot == "" {
			sysRoot = `C:\Windows` // safety fallback
		}
		fontsDir := filepath.Join(sysRoot, "Fonts")
		return filepath.Join(fontsDir, "segoeui.ttf"), filepath.Join(fontsDir, "segoeuisb.ttf")
	case "darwin":
		// macOS — SF NS Display is the system font on modern macOS.
		// The path has shifted over OS versions; we try the most-common one.
		return "/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/SFNS.ttf"
	default:
		return "", ""
	}
}

// loadFontsFromPaths reads each path and wraps it as a Fyne resource.
// Missing files return nil; the caller is expected to fall back.
func loadFontsFromPaths(regularPath, boldPath string) (fyne.Resource, fyne.Resource) {
	return readFontResource("system-regular", regularPath), readFontResource("system-bold", boldPath)
}

func readFontResource(name, path string) fyne.Resource {
	if path == "" {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "hedgebuddy: failed to load font %q: %v (falling back to Fyne default)\n", path, err)
		return nil
	}
	return fyne.NewStaticResource(name, data)
}
