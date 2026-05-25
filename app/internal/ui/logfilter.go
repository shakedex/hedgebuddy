package ui

import (
	"bytes"
	"io"
	"log"
	"os"
	"regexp"
	"sync"
)

// suppressedLogPatterns enumerates log substrings to drop from the default logger.
//
// fyne-tooltip v0.4.0 emits a "no canvas associated with tool tip widget" error
// any time a pending tooltip's host widget gets detached from the canvas before
// the hover delay fires (e.g. sidebar Rebuild, drawer open/close, popup menu
// dismissal). It's a benign timing race — tooltips still work where they should
// — but the warning clutters stderr. v0.4.0 is the latest release, and
// fyne.LogError isn't an overridable hook (it's a function, not a variable), so
// we filter at the log.Writer layer instead.
var suppressedLogPatterns = [][]byte{
	[]byte("no canvas associated with tool tip widget"),
	// Fyne's LogError prints a follow-up "At: <file>:<line>" line; match any
	// At-line whose file path contains "fyne-tooltip" to keep this scoped.
	[]byte("fyne-tooltip"),
}

// fyneErrorHeaderRe matches the bare "Fyne error: " line that fyne.LogError
// emits before the Cause/At lines. We buffer it for one Write so we can drop
// it retroactively when the next line is one of our suppressed patterns.
var fyneErrorHeaderRe = regexp.MustCompile(`(?m)^.*Fyne error:\s*\n?$`)

// filterWriter drops log lines containing any of the patterns and forwards
// everything else to the wrapped writer.
type filterWriter struct {
	w   io.Writer
	mu  sync.Mutex
	pen []byte // buffered "Fyne error: " header awaiting verdict
}

func (f *filterWriter) Write(p []byte) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	// If this line matches one of the suppression patterns, drop it AND any
	// pending Fyne error header.
	for _, pat := range suppressedLogPatterns {
		if bytes.Contains(p, pat) {
			f.pen = nil
			return len(p), nil
		}
	}

	// If this is a bare "Fyne error: " header (no reason text), buffer it
	// pending the next line's verdict.
	if fyneErrorHeaderRe.Match(p) {
		// Flush any previously pending header first — back-to-back orphans
		// are unlikely but shouldn't be lost.
		if f.pen != nil {
			if _, err := f.w.Write(f.pen); err != nil {
				f.pen = nil
				return 0, err
			}
		}
		buf := make([]byte, len(p))
		copy(buf, p)
		f.pen = buf
		return len(p), nil
	}

	// Non-matching line: flush any pending header, then emit this write.
	if f.pen != nil {
		if _, err := f.w.Write(f.pen); err != nil {
			f.pen = nil
			return 0, err
		}
		f.pen = nil
	}
	return f.w.Write(p)
}

// InstallLogFilter routes the default logger through a filter that drops the
// known-noisy fyne-tooltip warnings. All other log output is preserved.
func InstallLogFilter() {
	log.SetOutput(&filterWriter{w: os.Stderr})
}
