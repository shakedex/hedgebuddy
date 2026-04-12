//go:build windows

package install

import (
	"fmt"
	"os/exec"
	"time"

	"golang.org/x/sys/windows"
)

func killAndWait(pid int) error {
	if pid <= 0 {
		return nil
	}

	handle, err := windows.OpenProcess(windows.PROCESS_TERMINATE|windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		// Process may already be gone — treat as success.
		return nil
	}
	defer windows.CloseHandle(handle)

	if err := windows.TerminateProcess(handle, 0); err != nil {
		return fmt.Errorf("TerminateProcess: %w", err)
	}

	// Wait up to 5 seconds for the process to exit.
	windows.WaitForSingleObject(handle, 5000)
	time.Sleep(200 * time.Millisecond) // let file handles flush
	return nil
}

func relaunch(binaryPath string) error {
	// Use cmd /c start to detach the new process from this updater.
	cmd := exec.Command("cmd", "/c", "start", "", binaryPath, "-no-browser")
	return cmd.Start()
}
