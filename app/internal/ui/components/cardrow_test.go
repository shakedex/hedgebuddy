package components

import (
	"testing"

	"fyne.io/fyne/v2/test"
)

func TestCardRow_RendersWithoutPanic(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	c := NewCardRow(CardRowData{
		Name:        "API_KEY",
		Value:       "sk-abc123",
		Type:        "secret",
		Description: "for the billing service",
	}, CardRowActions{})

	w := test.NewWindow(c)
	defer w.Close()
	// If CreateRenderer panics, this fails.
}

func TestCardRow_SecretValueIsMasked(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()

	c := NewCardRow(CardRowData{
		Name:  "API_KEY",
		Value: "sk-abc123",
		Type:  "secret",
	}, CardRowActions{})

	if c.displayValue() != secretMask {
		t.Errorf("secret should be masked at rest; got %q", c.displayValue())
	}

	c.revealed = true
	if c.displayValue() != "sk-abc123" {
		t.Errorf("revealed secret should show value; got %q", c.displayValue())
	}
}

func TestMiddleEllipsize(t *testing.T) {
	cases := []struct {
		in, want string
		max      int
	}{
		{"short", "short", 20},
		{"C:\\Users\\shake\\AppData\\Roaming\\hedgebuddy\\google-key.json", "C:\\Users\\shake\\AppData\\Ro…hedgebuddy\\google-key.json", 52},
	}
	for _, c := range cases {
		got := middleEllipsize(c.in, c.max)
		if got != c.want {
			t.Errorf("middleEllipsize(%q, %d) = %q; want %q", c.in, c.max, got, c.want)
		}
	}
}
