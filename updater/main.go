package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/shakedex/hedgebuddy/updater/internal/download"
	releases "github.com/shakedex/hedgebuddy/updater/internal/github"
	"github.com/shakedex/hedgebuddy/updater/internal/install"
)

func main() {
	app := flag.String("app", "", "App to update: quills or hedgebuddy")
	version := flag.String("version", "", "Version string to display (e.g. 0.9.2)")
	callerPID := flag.Int("caller-pid", 0, "PID of the running app to replace")
	installDir := flag.String("install-dir", "", "Directory where the binary lives")
	flag.Parse()

	if *app == "" || *version == "" || *installDir == "" {
		fmt.Fprintln(os.Stderr, "Usage: updater --app <quills|hedgebuddy> --version <X.Y.Z> --install-dir <path> [--caller-pid <pid>]")
		os.Exit(1)
	}

	tagPattern := releases.TagPattern(*app)
	assetName := releases.AssetName(*app)

	fmt.Printf("==> Downloading %s v%s...\n", *app, *version)

	_, downloadURL, err := releases.FindLatest(tagPattern, assetName)
	if err != nil {
		fatalf("Could not find release: %v", err)
	}

	newPath := filepath.Join(*installDir, assetName+".new")
	if _, err := download.ToFile(downloadURL, newPath); err != nil {
		fatalf("Download failed: %v", err)
	}

	fmt.Printf("\n==> %s v%s downloaded successfully.\n", *app, *version)

	if !confirm(fmt.Sprintf("Install %s v%s now?\n\nThe app will be restarted automatically.", *app, *version)) {
		fmt.Println("Installation cancelled. The download has been discarded.")
		_ = os.Remove(newPath)
		os.Exit(0)
	}

	fmt.Println("==> Installing...")
	if err := install.Run(*installDir, assetName, *callerPID); err != nil {
		fatalf("Installation failed: %v", err)
	}

	fmt.Println("==> Done. Restarting...")
	os.Exit(0)
}

func fatalf(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	showError(msg)
	fmt.Fprintln(os.Stderr, "Error:", msg)
	os.Exit(1)
}
