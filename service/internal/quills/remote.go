package quills

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/shakedex/hedgebuddy/service/internal/runner"
	"gopkg.in/yaml.v3"
)

// RemoteQuill is the metadata for a quill available in a remote repo.
type RemoteQuill struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
	Author      string `json:"author"`
	Category    string `json:"category"`
	Installed   bool   `json:"installed"`
	UpdateAvail bool   `json:"update_available,omitempty"`
}

// DefaultRepoURL is the raw GitHub URL to the official quills repository.
const DefaultRepoURL = "https://raw.githubusercontent.com/shakedex/hedgebuddy/master/quills"

var httpClient = &http.Client{Timeout: 15 * time.Second}

// FetchRemoteIndex fetches the quill index from a repo URL.
// The index is at <repoURL>/index.json — a JSON array of quill folder names.
func FetchRemoteIndex(repoURL string) ([]RemoteQuill, error) {
	url := strings.TrimRight(repoURL, "/") + "/index.json"
	resp, err := httpClient.Get(url) //nolint:noctx
	if err != nil {
		return nil, fmt.Errorf("fetching index: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("index returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("reading index: %w", err)
	}

	var index []RemoteQuill
	if err := json.Unmarshal(body, &index); err != nil {
		return nil, fmt.Errorf("parsing index: %w", err)
	}

	return index, nil
}

// FetchRemoteQuillYAML fetches a single quill.yaml from a repo.
func FetchRemoteQuillYAML(repoURL, quillID string) ([]byte, error) {
	url := strings.TrimRight(repoURL, "/") + "/" + quillID + "/quill.yaml"
	resp, err := httpClient.Get(url) //nolint:noctx
	if err != nil {
		return nil, fmt.Errorf("fetching quill.yaml: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("quill.yaml returned %d", resp.StatusCode)
	}

	return io.ReadAll(io.LimitReader(resp.Body, 512<<10))
}

// FetchRemoteFile fetches a helper file (e.g. main.py, requirements.txt) from a quill folder.
func FetchRemoteFile(repoURL, quillID, filename string) ([]byte, error) {
	url := strings.TrimRight(repoURL, "/") + "/" + quillID + "/" + filename
	resp, err := httpClient.Get(url) //nolint:noctx
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil // optional file
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s returned %d", filename, resp.StatusCode)
	}

	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}

// Install downloads a quill from a repo and saves it to the installed directory.
func (lib *Library) Install(repoURL, quillID, installedDir string) (*Quill, error) {
	// Don't allow overriding built-in quills.
	if existing, ok := lib.quills[quillID]; ok && existing.Source == "builtin" {
		return nil, fmt.Errorf("cannot override built-in quill %q", quillID)
	}

	// Fetch quill.yaml
	yamlData, err := FetchRemoteQuillYAML(repoURL, quillID)
	if err != nil {
		return nil, fmt.Errorf("downloading quill: %w", err)
	}

	q, err := parseQuill(yamlData)
	if err != nil {
		return nil, fmt.Errorf("parsing quill: %w", err)
	}

	if issues := Validate(q); len(issues) > 0 {
		return nil, fmt.Errorf("invalid quill: %s", strings.Join(issues, "; "))
	}

	// Create quill directory
	qDir := filepath.Join(installedDir, quillID)
	if err := os.MkdirAll(qDir, 0o755); err != nil {
		return nil, fmt.Errorf("creating quill directory: %w", err)
	}

	// Write quill.yaml
	if err := os.WriteFile(filepath.Join(qDir, "quill.yaml"), yamlData, 0o644); err != nil {
		return nil, fmt.Errorf("writing quill.yaml: %w", err)
	}

	// Fetch optional files: main.py, requirements.txt
	for _, fname := range []string{"main.py", "requirements.txt"} {
		data, err := FetchRemoteFile(repoURL, quillID, fname)
		if err != nil {
			log.Printf("[quills] Warning: failed to fetch %s for %s: %v", fname, quillID, err)
			continue
		}
		if data != nil {
			if err := os.WriteFile(filepath.Join(qDir, fname), data, 0o644); err != nil {
				log.Printf("[quills] Warning: failed to write %s: %v", fname, err)
			}
		}
	}

	// If requirements.txt was downloaded, run pip install.
	if _, err := os.Stat(filepath.Join(qDir, "requirements.txt")); err == nil {
		if pipErr := runner.PipInstall(qDir); pipErr != nil {
			log.Printf("[quills] Warning: pip install failed for %s: %v", quillID, pipErr)
			// Don't fail the install — the quill may still work without extra deps.
		}
	}

	q.Source = "installed"
	q.Dir = qDir
	lib.quills[q.ID] = q

	log.Printf("[quills] Installed %s v%s to %s", q.ID, q.Version, qDir)
	return q, nil
}

// Uninstall removes an installed quill from disk and the library.
func (lib *Library) Uninstall(quillID string) error {
	q, ok := lib.quills[quillID]
	if !ok {
		return fmt.Errorf("quill %q not found", quillID)
	}
	if q.Source == "builtin" {
		return fmt.Errorf("cannot uninstall built-in quill %q", quillID)
	}
	if q.Dir == "" {
		return fmt.Errorf("quill %q has no directory", quillID)
	}

	if err := os.RemoveAll(q.Dir); err != nil {
		return fmt.Errorf("removing quill directory: %w", err)
	}

	delete(lib.quills, quillID)
	log.Printf("[quills] Uninstalled %s", quillID)
	return nil
}

// CheckUpdates checks installed quills against a remote repo for newer versions.
func (lib *Library) CheckUpdates(repoURL string) ([]RemoteQuill, error) {
	index, err := FetchRemoteIndex(repoURL)
	if err != nil {
		return nil, err
	}

	// Annotate with installed status and update availability.
	for i := range index {
		rq := &index[i]
		if local, ok := lib.quills[rq.ID]; ok {
			rq.Installed = true
			rq.UpdateAvail = isNewerVersion(rq.Version, local.Version)
		}
	}

	return index, nil
}

// isNewerVersion returns true if remote is strictly newer than local.
// Compares dot-separated numeric segments (e.g. "1.2.0" > "1.1.0").
// Non-numeric segments are compared lexicographically as fallback.
func isNewerVersion(remote, local string) bool {
	rParts := strings.Split(strings.TrimPrefix(remote, "v"), ".")
	lParts := strings.Split(strings.TrimPrefix(local, "v"), ".")
	maxLen := len(rParts)
	if len(lParts) > maxLen {
		maxLen = len(lParts)
	}
	for i := 0; i < maxLen; i++ {
		var rSeg, lSeg string
		if i < len(rParts) {
			rSeg = rParts[i]
		}
		if i < len(lParts) {
			lSeg = lParts[i]
		}
		rNum, rErr := strconv.Atoi(rSeg)
		lNum, lErr := strconv.Atoi(lSeg)
		if rErr == nil && lErr == nil {
			if rNum != lNum {
				return rNum > lNum
			}
		} else if rSeg != lSeg {
			return rSeg > lSeg
		}
	}
	return false
}

// InstallFromYAML installs a quill from raw YAML data and optional companion files.
// extraFiles maps filenames (e.g. "main.py", "requirements.txt") to their contents.
func (lib *Library) InstallFromYAML(yamlData []byte, extraFiles map[string][]byte, installedDir string) (*Quill, error) {
	q, err := parseQuill(yamlData)
	if err != nil {
		return nil, fmt.Errorf("parsing quill: %w", err)
	}

	if issues := Validate(q); len(issues) > 0 {
		return nil, fmt.Errorf("invalid quill: %s", strings.Join(issues, "; "))
	}

	// Don't allow overriding built-in quills.
	if existing, ok := lib.quills[q.ID]; ok && existing.Source == "builtin" {
		return nil, fmt.Errorf("cannot override built-in quill %q", q.ID)
	}

	qDir := filepath.Join(installedDir, q.ID)
	if err := os.MkdirAll(qDir, 0o755); err != nil {
		return nil, fmt.Errorf("creating quill directory: %w", err)
	}

	if err := os.WriteFile(filepath.Join(qDir, "quill.yaml"), yamlData, 0o644); err != nil {
		return nil, fmt.Errorf("writing quill.yaml: %w", err)
	}

	// Write companion files (main.py, requirements.txt, etc.).
	for fname, data := range extraFiles {
		if err := os.WriteFile(filepath.Join(qDir, fname), data, 0o644); err != nil {
			log.Printf("[quills] Warning: failed to write %s: %v", fname, err)
		}
	}

	// If requirements.txt was provided, run pip install.
	if _, hasReqs := extraFiles["requirements.txt"]; hasReqs {
		if pipErr := runner.PipInstall(qDir); pipErr != nil {
			log.Printf("[quills] Warning: pip install failed for %s: %v", q.ID, pipErr)
		}
	}

	q.Source = "installed"
	q.Dir = qDir
	lib.quills[q.ID] = q

	log.Printf("[quills] Manually installed %s v%s to %s", q.ID, q.Version, qDir)
	return q, nil
}

// InstalledDir returns the path where installed quills should be stored.
func InstalledDir(baseDir string) string {
	return filepath.Join(baseDir, "installed")
}

// ParseQuillYAML parses and validates a quill.yaml from raw bytes (exported for testing).
func ParseQuillYAML(data []byte) (*Quill, error) {
	var q Quill
	if err := yaml.Unmarshal(data, &q); err != nil {
		return nil, err
	}
	processSteps(q.Steps)
	for name, mode := range q.Modes {
		processSteps(mode.Steps)
		q.Modes[name] = mode
	}
	return &q, nil
}
