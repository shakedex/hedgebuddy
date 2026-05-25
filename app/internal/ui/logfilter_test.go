package ui

import (
	"bytes"
	"testing"
)

// TestFilterWriter_SuppressesCanvasError verifies that the three-line
// fyne-tooltip "no canvas associated with tool tip widget" pattern is
// dropped in its entirety: header, Cause, and At lines.
func TestFilterWriter_SuppressesCanvasError(t *testing.T) {
	var sink bytes.Buffer
	fw := &filterWriter{w: &sink}

	// fyne.LogError emits these three log.Println/Printf calls in order.
	writes := []string{
		"2026/05/25 12:34:56 Fyne error:  \n",
		"2026/05/25 12:34:56   Cause: no canvas associated with tool tip widget\n",
		"2026/05/25 12:34:56   At: C:\\Users\\x\\go\\pkg\\mod\\github.com\\dweymouth\\fyne-tooltip@v0.4.0\\internal\\tooltip_layer.go:73\n",
	}
	for _, w := range writes {
		if _, err := fw.Write([]byte(w)); err != nil {
			t.Fatalf("write failed: %v", err)
		}
	}

	if got := sink.String(); got != "" {
		t.Errorf("expected empty output, got: %q", got)
	}
}

// TestFilterWriter_PreservesUnrelatedErrors verifies that an unrelated
// Fyne error (or non-Fyne log line) passes through untouched.
func TestFilterWriter_PreservesUnrelatedErrors(t *testing.T) {
	var sink bytes.Buffer
	fw := &filterWriter{w: &sink}

	writes := []string{
		"2026/05/25 12:34:56 Fyne error:  \n",
		"2026/05/25 12:34:56   Cause: window failed to initialize\n",
		"2026/05/25 12:34:56   At: C:\\Users\\x\\go\\pkg\\mod\\fyne.io\\fyne\\v2@v2.7.3\\window.go:142\n",
	}
	for _, w := range writes {
		if _, err := fw.Write([]byte(w)); err != nil {
			t.Fatalf("write failed: %v", err)
		}
	}

	got := sink.String()
	for _, w := range writes {
		if !bytes.Contains([]byte(got), []byte(w)) {
			t.Errorf("expected output to contain %q, got: %q", w, got)
		}
	}
}

// TestFilterWriter_PassesThroughPlainLogs verifies that non-Fyne log lines
// pass through with no buffering side effects.
func TestFilterWriter_PassesThroughPlainLogs(t *testing.T) {
	var sink bytes.Buffer
	fw := &filterWriter{w: &sink}

	line := "2026/05/25 12:34:56 hedgebuddy: profile saved\n"
	if _, err := fw.Write([]byte(line)); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	if got := sink.String(); got != line {
		t.Errorf("expected %q, got %q", line, got)
	}
}

// TestFilterWriter_OrphanedFyneHeaderFlushedOnUnrelatedLine verifies that a
// buffered "Fyne error:" header is flushed when the next line is not a
// suppressed pattern (e.g. an unrelated error came in).
func TestFilterWriter_OrphanedFyneHeaderFlushedOnUnrelatedLine(t *testing.T) {
	var sink bytes.Buffer
	fw := &filterWriter{w: &sink}

	header := "2026/05/25 12:34:56 Fyne error:  \n"
	next := "2026/05/25 12:34:56 something completely different\n"

	if _, err := fw.Write([]byte(header)); err != nil {
		t.Fatalf("write 1 failed: %v", err)
	}
	if _, err := fw.Write([]byte(next)); err != nil {
		t.Fatalf("write 2 failed: %v", err)
	}

	got := sink.String()
	if !bytes.Contains([]byte(got), []byte(header)) {
		t.Errorf("expected header to be flushed, got: %q", got)
	}
	if !bytes.Contains([]byte(got), []byte(next)) {
		t.Errorf("expected next line, got: %q", got)
	}
}
