package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"time"
)

// PythonInput is the JSON payload sent to a Python quill via stdin.
type PythonInput struct {
	Command   string            `json:"command"`              // "execute", "load_options", "test_connection"
	Settings  map[string]string `json:"settings"`             // Persistent quill-level settings
	Inputs    map[string]string `json:"inputs"`               // Per-workflow-step inputs
	HBVars    map[string]string `json:"hb_vars,omitempty"`    // HedgeBuddy variables from the active profile
	Event     map[string]any    `json:"event"`                // Event payload
	AppID     string            `json:"app_id"`               // Source app
	EventName string            `json:"event_name"`           // Event type
	InputName string            `json:"input_name,omitempty"` // For load_options: which input
}

// PythonOutput is the JSON response expected from a Python quill via stdout.
type PythonOutput struct {
	OK     bool   `json:"ok"`
	Output any    `json:"output,omitempty"`
	Error  string `json:"error,omitempty"`
}

// DefaultTimeout is the maximum time a Python quill can run.
const DefaultTimeout = 30 * time.Second

// CommandTimeout is the timeout for interactive commands (load_options, test_connection).
const CommandTimeout = 10 * time.Second

// RunPython executes a Python quill script and returns its output.
// The entry parameter is the path to the Python script (e.g. main.py).
// The dir parameter is the working directory for the script.
func RunPython(dir, entry string, input PythonInput) (PythonOutput, error) {
	return RunPythonWithTimeout(dir, entry, input, DefaultTimeout)
}

// RunCommand executes an interactive Python quill command (load_options, test_connection)
// with a shorter timeout appropriate for UI-driven interactions.
func RunCommand(dir, entry string, input PythonInput) (PythonOutput, error) {
	return RunPythonWithTimeout(dir, entry, input, CommandTimeout)
}

// RunPythonWithTimeout executes a Python quill with a custom timeout.
func RunPythonWithTimeout(dir, entry string, input PythonInput, timeout time.Duration) (PythonOutput, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	pythonBin := findPython()
	if pythonBin == "" {
		return PythonOutput{}, fmt.Errorf("python not found in PATH")
	}

	inputJSON, err := json.Marshal(input)
	if err != nil {
		return PythonOutput{}, fmt.Errorf("marshaling input: %w", err)
	}

	cmd := exec.CommandContext(ctx, pythonBin, entry)
	cmd.Dir = dir
	cmd.Stdin = bytes.NewReader(inputJSON)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		stderrStr := stderr.String()
		if ctx.Err() == context.DeadlineExceeded {
			return PythonOutput{}, fmt.Errorf("python quill timed out after %v", timeout)
		}
		if stderrStr != "" {
			log.Printf("[runner] Python stderr: %s", stderrStr)
		}
		return PythonOutput{}, fmt.Errorf("python quill failed: %w (stderr: %s)", err, stderrStr)
	}

	if stderr.Len() > 0 {
		log.Printf("[runner] Python stderr: %s", stderr.String())
	}

	var output PythonOutput
	if err := json.Unmarshal(stdout.Bytes(), &output); err != nil {
		return PythonOutput{}, fmt.Errorf("parsing python output: %w (raw: %s)", err, stdout.String())
	}

	return output, nil
}

// PipInstall runs "pip install -r requirements.txt" in the given directory.
// Returns nil if requirements.txt does not exist.
func PipInstall(dir string) error {
	reqPath := dir + "/requirements.txt"
	if _, err := exec.LookPath("pip"); err != nil {
		// Try pip3
		if _, err := exec.LookPath("pip3"); err != nil {
			return fmt.Errorf("pip not found in PATH")
		}
	}

	pipBin := "pip"
	if _, err := exec.LookPath("pip3"); err == nil {
		pipBin = "pip3"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, pipBin, "install", "-r", reqPath)
	cmd.Dir = dir

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	log.Printf("[runner] Running %s install -r requirements.txt in %s", pipBin, dir)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("pip install failed: %w (stderr: %s)", err, stderr.String())
	}

	log.Printf("[runner] pip install completed for %s", dir)
	return nil
}

// findPython returns the path to a Python executable, or empty if not found.
func findPython() string {
	for _, name := range []string{"python3", "python"} {
		if path, err := exec.LookPath(name); err == nil {
			return path
		}
	}
	return ""
}
