//go:build darwin || linux

package install

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

func killAndWait(pid int) error {
	if pid <= 0 {
		return nil
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		return nil // already gone
	}

	if err := proc.Signal(syscall.SIGTERM); err != nil {
		return nil // already gone
	}

	// Poll up to 5 seconds for the process to exit.
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(200 * time.Millisecond)
		if err := proc.Signal(syscall.Signal(0)); err != nil {
			return nil // process gone
		}
	}

	// Force kill if still running.
	if err := proc.Signal(syscall.SIGKILL); err != nil {
		return fmt.Errorf("SIGKILL failed: %w", err)
	}
	time.Sleep(200 * time.Millisecond)
	return nil
}

func relaunch(binaryPath string) error {
	cmd := exec.Command(binaryPath, "-no-browser")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}
