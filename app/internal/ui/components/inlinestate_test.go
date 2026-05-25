package components

import (
	"testing"
	"time"

	"fyne.io/fyne/v2/test"
)

func TestInlineStateButton_DefaultState(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	b := NewInlineStateButton("Save", "Saved", "Save failed", func() {})
	if b.State() != StateIdle {
		t.Errorf("expected StateIdle, got %v", b.State())
	}
}

func TestInlineStateButton_StateTransitions(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	// Replace the clock with a no-op so SetState(StateDone) doesn't auto-revert during the test.
	b := NewInlineStateButton("Save", "Saved", "Save failed", func() {})
	b.clock = func(time.Duration, func()) {}

	b.SetState(StateBusy)
	if b.State() != StateBusy {
		t.Errorf("expected StateBusy, got %v", b.State())
	}

	b.SetState(StateDone)
	if b.State() != StateDone {
		t.Errorf("expected StateDone, got %v", b.State())
	}

	b.SetState(StateError)
	if b.State() != StateError {
		t.Errorf("expected StateError, got %v", b.State())
	}

	b.SetState(StateIdle)
	if b.State() != StateIdle {
		t.Errorf("expected StateIdle, got %v", b.State())
	}
}

func TestInlineStateButton_TapWhileBusyIsIgnored(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	count := 0
	b := NewInlineStateButton("Save", "Saved", "Save failed", func() { count++ })
	b.clock = func(time.Duration, func()) {}

	b.SetState(StateBusy)
	b.handleTap()
	if count != 0 {
		t.Errorf("expected onTap suppressed during busy, got count=%d", count)
	}

	b.SetState(StateIdle)
	b.handleTap()
	if count != 1 {
		t.Errorf("expected onTap fired in idle, got count=%d", count)
	}
}
