//go:build darwin

package autostart

import (
	"fmt"
	"os"
	"path/filepath"
)

const plistName = "io.github.shakedex.quills.plist"

func plistPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", plistName)
}

func isEnabled() bool {
	_, err := os.Stat(plistPath())
	return err == nil
}

func enable(exePath string) error {
	dir := filepath.Dir(plistPath())
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.github.shakedex.quills</string>
    <key>ProgramArguments</key>
    <array>
        <string>%s</string>
        <string>-no-browser</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/tmp/quills.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/quills.stderr.log</string>
</dict>
</plist>
`, exePath)

	return os.WriteFile(plistPath(), []byte(plist), 0o644)
}

func disable() error {
	err := os.Remove(plistPath())
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
