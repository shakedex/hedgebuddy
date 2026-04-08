package pythoncheck

import (
	"fmt"
	"io"
	"os/exec"
	"runtime"
)

// PythonStatus holds the result of detecting Python and the hedgebuddy library.
type PythonStatus struct {
	PythonFound      bool
	Executable       string // e.g. "py", "python3", "python"
	LibraryInstalled bool
}

// candidates returns the ordered list of Python executable names to try.
func candidates() []string {
	if runtime.GOOS == "windows" {
		return []string{"py", "python", "python3"}
	}
	return []string{"python3", "python"}
}

// Detect probes the system for a working Python interpreter and checks
// whether the hedgebuddy package is importable.
func Detect() PythonStatus {
	for _, exe := range candidates() {
		if err := exec.Command(exe, "--version").Run(); err != nil {
			continue
		}
		// Python found — check library
		libErr := exec.Command(exe, "-c", "import hedgebuddy").Run()
		return PythonStatus{
			PythonFound:      true,
			Executable:       exe,
			LibraryInstalled: libErr == nil,
		}
	}
	return PythonStatus{}
}

// Install runs "pip install --user hedgebuddy" using the given Python
// executable, streaming all output to w in real time.
func Install(executable string, w io.Writer) error {
	cmd := exec.Command(executable, "-m", "pip", "install", "--user", "hedgebuddy")
	cmd.Stdout = w
	cmd.Stderr = w
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("pip install failed: %w", err)
	}
	return nil
}
