package server

import (
	"embed"
	_ "embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed inject.py
var injectPy []byte

//go:embed scripts/*.py
var scriptsFS embed.FS

func (s *Server) handleDownloadInjectPy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/x-python")
	w.Header().Set("Content-Disposition", `attachment; filename="inject.py"`)
	w.Write(injectPy)
}

func (s *Server) handleDownloadScript(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("filename")

	// Sanitise: only allow .py files with no path separators.
	if filename == "" || strings.ContainsAny(filename, "/\\") || !strings.HasSuffix(filename, ".py") {
		http.NotFound(w, r)
		return
	}

	data, err := fs.ReadFile(scriptsFS, path.Join("scripts", filename))
	if err != nil {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "text/x-python")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Write(data)
}

func (s *Server) handleListScripts(w http.ResponseWriter, r *http.Request) {
	entries, err := fs.ReadDir(scriptsFS, "scripts")
	if err != nil {
		jsonError(w, "failed to list scripts", http.StatusInternalServerError)
		return
	}

	type scriptInfo struct {
		Filename string `json:"filename"`
		App      string `json:"app"`
		Event    string `json:"event"`
	}

	var scripts []scriptInfo
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".py") {
			continue
		}
		// Parse "inject_{app}_{event}.py"
		trimmed := strings.TrimPrefix(name, "inject_")
		trimmed = strings.TrimSuffix(trimmed, ".py")
		parts := strings.SplitN(trimmed, "_", 2)
		if len(parts) != 2 {
			continue
		}
		scripts = append(scripts, scriptInfo{
			Filename: name,
			App:      parts[0],
			Event:    parts[1],
		})
	}

	jsonOK(w, scripts)
}
