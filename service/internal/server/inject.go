package server

import (
	_ "embed"
	"net/http"
)

//go:embed inject.py
var injectPy []byte

func (s *Server) handleDownloadInjectPy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/x-python")
	w.Header().Set("Content-Disposition", `attachment; filename="inject.py"`)
	w.Write(injectPy)
}
