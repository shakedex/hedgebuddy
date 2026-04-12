//go:build windows

package diskinv

import (
	"strings"
	"syscall"
	"unsafe"
)

var (
	kernel32               = syscall.NewLazyDLL("kernel32.dll")
	getLogicalDriveStrings = kernel32.NewProc("GetLogicalDriveStringsW")
)

// Snapshot returns the set of currently-mounted drive paths on Windows
// (e.g. {"C:\": true, "D:\": true}).  Keys are upper-cased drive letters
// with trailing backslash to match OffShoot's DiskAdded_deviceName format.
func Snapshot() map[string]bool {
	// GetLogicalDriveStringsW returns null-separated wide-char drive strings.
	buf := make([]uint16, 256)
	n, _, _ := getLogicalDriveStrings.Call(
		uintptr(len(buf)),
		uintptr(unsafe.Pointer(&buf[0])),
	)
	if n == 0 {
		return nil
	}

	drives := make(map[string]bool)
	raw := syscall.UTF16ToString(buf[:n])
	// The result is "C:\\\x00D:\\\x00\x00" — split on null.
	// But UTF16ToString stops at the first null, so we need to walk manually.
	for i := 0; i < int(n); {
		end := i
		for end < int(n) && buf[end] != 0 {
			end++
		}
		if end > i {
			s := string(syscall.UTF16ToString(buf[i:end]))
			drives[strings.ToUpper(s)] = true
		}
		i = end + 1
	}
	_ = raw // suppress unused warning

	return drives
}
