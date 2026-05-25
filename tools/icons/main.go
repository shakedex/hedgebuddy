// tools/icons/main.go — one-shot downloader for Lucide SVGs.
//
// Reads tools/icons/sources.txt (one icon name per line), fetches the SVG
// from the pinned Lucide commit, normalizes stroke colors, and writes them
// to app/internal/ui/icons/svg/.
//
// Run from the repo root:    go run ./tools/icons
package main

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Pinned to a specific Lucide release for reproducibility. Bump as needed.
const lucideTag = "0.453.0"

const baseURL = "https://raw.githubusercontent.com/lucide-icons/lucide/" + lucideTag + "/icons/"

const outDir = "app/internal/ui/icons/svg"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "ERROR:", err)
		os.Exit(1)
	}
}

func run() error {
	names, err := readSourceList("tools/icons/sources.txt")
	if err != nil {
		return fmt.Errorf("read sources: %w", err)
	}

	if err := os.MkdirAll(outDir, 0755); err != nil {
		return fmt.Errorf("mkdir %s: %w", outDir, err)
	}

	for _, name := range names {
		if err := fetch(name); err != nil {
			return fmt.Errorf("fetch %q: %w", name, err)
		}
		fmt.Printf("  ✓ %s\n", name)
	}
	fmt.Printf("\nFetched %d icons into %s\n", len(names), outDir)
	return nil
}

func readSourceList(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var names []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		names = append(names, line)
	}
	return names, scanner.Err()
}

func fetch(name string) error {
	resp, err := http.Get(baseURL + name + ".svg")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	// Normalize: Fyne's renderer treats stroke="currentColor" inconsistently.
	// Replace with explicit white; the IconButton wrapper handles tinting.
	body = []byte(strings.ReplaceAll(string(body), `stroke="currentColor"`, `stroke="#FFFFFF"`))

	outPath := filepath.Join(outDir, name+".svg")
	return os.WriteFile(outPath, body, 0644)
}
