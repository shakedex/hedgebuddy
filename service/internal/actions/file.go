package actions

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// ── Helpers ──────────────────────────────────────────────────────────────────

// resolveDest figures out the real destination path.
// If dst is an existing directory, the source basename is appended so the file/dir
// ends up inside it (e.g. source="/a/report.pdf" + dst="/b" → "/b/report.pdf").
// Otherwise dst is used as-is (rename/explicit target).
func resolveDest(src, dst string) string {
	info, err := os.Stat(dst)
	if err == nil && info.IsDir() {
		return filepath.Join(dst, filepath.Base(src))
	}
	return dst
}

// copyFile copies a single file, preserving permissions.
func copyFile(src, dst string) (int64, error) {
	sf, err := os.Open(src)
	if err != nil {
		return 0, err
	}
	defer sf.Close()

	si, err := sf.Stat()
	if err != nil {
		return 0, err
	}

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return 0, err
	}

	df, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, si.Mode())
	if err != nil {
		return 0, err
	}
	defer df.Close()

	return io.Copy(df, sf)
}

// copyTree recursively copies a directory tree.
func copyTree(src, dst string) (int64, error) {
	var total int64
	return total, filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		target := filepath.Join(dst, rel)

		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		n, err := copyFile(path, target)
		total += n
		return err
	})
}

// removeAll removes a file or directory tree.
func removeAll(path string) error {
	return os.RemoveAll(path)
}

// ── FileMoveAction ──────────────────────────────────────────────────────────

// FileMoveAction moves a file or directory.
// Handles cross-volume moves (copy + delete) and smart destination resolution.
type FileMoveAction struct{}

func (a *FileMoveAction) Name() string { return "file.move" }

func (a *FileMoveAction) Execute(config map[string]any, ctx *Context) Result {
	src, _ := config["source"].(string)
	dst, _ := config["destination"].(string)
	if src == "" || dst == "" {
		return Result{Error: "file.move: source and destination are required", OK: false}
	}

	// Verify source exists.
	srcInfo, err := os.Stat(src)
	if err != nil {
		return Result{Error: fmt.Sprintf("file.move: source not found: %v", err), OK: false}
	}

	dst = resolveDest(src, dst)

	// Ensure parent directory exists.
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return Result{Error: fmt.Sprintf("file.move: creating destination dir: %v", err), OK: false}
	}

	// Try rename first (fast, same-volume only).
	if err := os.Rename(src, dst); err == nil {
		return Result{Output: map[string]any{"destination": dst}, OK: true}
	}

	// Rename failed (likely cross-volume) — fall back to copy + delete.
	if srcInfo.IsDir() {
		if _, err := copyTree(src, dst); err != nil {
			return Result{Error: fmt.Sprintf("file.move: copying directory: %v", err), OK: false}
		}
	} else {
		if _, err := copyFile(src, dst); err != nil {
			return Result{Error: fmt.Sprintf("file.move: copying file: %v", err), OK: false}
		}
	}

	// Remove original after successful copy.
	if err := removeAll(src); err != nil {
		return Result{Error: fmt.Sprintf("file.move: copied successfully but failed to remove source: %v", err), OK: false}
	}

	return Result{Output: map[string]any{"destination": dst}, OK: true}
}

// ── FileCopyAction ──────────────────────────────────────────────────────────

// FileCopyAction copies a file or directory.
// If source is a file and destination is an existing directory, the file is
// placed inside it. If source is a directory, the tree is copied recursively.
type FileCopyAction struct{}

func (a *FileCopyAction) Name() string { return "file.copy" }

func (a *FileCopyAction) Execute(config map[string]any, ctx *Context) Result {
	src, _ := config["source"].(string)
	dst, _ := config["destination"].(string)
	if src == "" || dst == "" {
		return Result{Error: "file.copy: source and destination are required", OK: false}
	}

	srcInfo, err := os.Stat(src)
	if err != nil {
		return Result{Error: fmt.Sprintf("file.copy: source not found: %v", err), OK: false}
	}

	dst = resolveDest(src, dst)

	if srcInfo.IsDir() {
		n, err := copyTree(src, dst)
		if err != nil {
			return Result{Error: fmt.Sprintf("file.copy: %v", err), OK: false}
		}
		return Result{Output: map[string]any{"destination": dst, "bytes_copied": n}, OK: true}
	}

	n, err := copyFile(src, dst)
	if err != nil {
		return Result{Error: fmt.Sprintf("file.copy: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"destination": dst, "bytes_copied": n}, OK: true}
}

// FileWriteAction writes text to a file (overwrite).
type FileWriteAction struct{}

func (a *FileWriteAction) Name() string { return "file.write" }

func (a *FileWriteAction) Execute(config map[string]any, ctx *Context) Result {
	path, _ := config["path"].(string)
	content, _ := config["content"].(string)
	if path == "" {
		return Result{Error: "file.write: path is required", OK: false}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return Result{Error: fmt.Sprintf("file.write: %v", err), OK: false}
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return Result{Error: fmt.Sprintf("file.write: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"path": path}, OK: true}
}

// FileAppendAction appends text to a file.
type FileAppendAction struct{}

func (a *FileAppendAction) Name() string { return "file.append" }

func (a *FileAppendAction) Execute(config map[string]any, ctx *Context) Result {
	path, _ := config["path"].(string)
	content, _ := config["content"].(string)
	if path == "" {
		return Result{Error: "file.append: path is required", OK: false}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return Result{Error: fmt.Sprintf("file.append: %v", err), OK: false}
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return Result{Error: fmt.Sprintf("file.append: %v", err), OK: false}
	}
	defer f.Close()
	if _, err := f.WriteString(content); err != nil {
		return Result{Error: fmt.Sprintf("file.append: %v", err), OK: false}
	}
	return Result{Output: map[string]any{"path": path}, OK: true}
}
