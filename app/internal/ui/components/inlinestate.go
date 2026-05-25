package components

import (
	"sync"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/widget"

	"app/internal/ui/icons"
)

// ButtonState enumerates the lifecycle of an InlineStateButton.
type ButtonState int

const (
	StateIdle ButtonState = iota
	StateBusy
	StateDone
	StateError
)

const (
	doneHoldMs  = 1000
	errorHoldMs = 3000
)

// InlineStateButton is a primary button that morphs through idle → busy → done.
// Replaces transient toast notifications for save / import / export / install actions.
type InlineStateButton struct {
	*widget.Button
	mu         sync.Mutex
	state      ButtonState
	idleLabel  string
	idleIcon   fyne.Resource
	doneLabel  string
	errorLabel string
	onTap      func()
	clock      func(time.Duration, func()) // override for tests
}

// NewInlineStateButton creates a button that begins in idle state.
// `idleLabel` is the resting label (e.g. "Save").
// `doneLabel` is shown after busy completes (e.g. "Saved").
// `errorLabel` is shown on error from busy (e.g. "Save failed").
// `onTap` is the user-supplied click handler; the button itself manages state transitions.
func NewInlineStateButton(idleLabel, doneLabel, errorLabel string, onTap func()) *InlineStateButton {
	b := &InlineStateButton{
		idleLabel:  idleLabel,
		idleIcon:   nil,
		doneLabel:  doneLabel,
		errorLabel: errorLabel,
		onTap:      onTap,
		clock:      func(d time.Duration, f func()) { time.AfterFunc(d, f) },
	}
	btn := widget.NewButton(idleLabel, b.handleTap)
	btn.Importance = widget.HighImportance
	b.Button = btn
	return b
}

// SetState transitions the button to a new state. Safe to call from any goroutine.
func (b *InlineStateButton) SetState(s ButtonState) {
	b.mu.Lock()
	b.state = s
	b.mu.Unlock()

	switch s {
	case StateIdle:
		fyne.Do(func() {
			b.Button.SetText(b.idleLabel)
			b.Button.SetIcon(b.idleIcon)
			b.Button.Enable()
			b.Button.Importance = widget.HighImportance
			b.Button.Refresh()
		})
	case StateBusy:
		fyne.Do(func() {
			b.Button.SetText(b.idleLabel + "…")
			b.Button.SetIcon(nil)
			b.Button.Disable()
			b.Button.Refresh()
		})
	case StateDone:
		fyne.Do(func() {
			b.Button.SetText(b.doneLabel)
			b.Button.SetIcon(icons.Check)
			b.Button.Importance = widget.SuccessImportance
			b.Button.Refresh()
		})
		b.clock(time.Duration(doneHoldMs)*time.Millisecond, func() {
			if b.currentState() == StateDone {
				b.SetState(StateIdle)
			}
		})
	case StateError:
		fyne.Do(func() {
			b.Button.SetText(b.errorLabel)
			b.Button.SetIcon(icons.X)
			b.Button.Importance = widget.DangerImportance
			b.Button.Enable()
			b.Button.Refresh()
		})
		b.clock(time.Duration(errorHoldMs)*time.Millisecond, func() {
			if b.currentState() == StateError {
				b.SetState(StateIdle)
			}
		})
	}
}

// State returns the current state. Thread-safe.
func (b *InlineStateButton) State() ButtonState { return b.currentState() }

func (b *InlineStateButton) currentState() ButtonState {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.state
}

func (b *InlineStateButton) handleTap() {
	if b.currentState() == StateBusy {
		return
	}
	if b.onTap != nil {
		b.onTap()
	}
}
