package server

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/shakedex/hedgebuddy/service/internal/engine"
	"github.com/shakedex/hedgebuddy/service/internal/quills"
	"github.com/shakedex/hedgebuddy/service/internal/schema"
	"github.com/shakedex/hedgebuddy/service/internal/storage"
	"github.com/shakedex/hedgebuddy/service/internal/version"
)

// Server is the HTTP server for the Quills service.
type Server struct {
	mux       *http.ServeMux
	engine    *engine.Engine
	store     *storage.Store
	workflows *storage.WorkflowStore
	registry  *schema.Registry
	quills    *quills.Library
	port      int
	webFS     fs.FS // embedded React build (nil in dev mode)
}

// New creates a new HTTP server. Pass webFS as nil for dev mode (no embedded SPA).
func New(eng *engine.Engine, store *storage.Store, wf *storage.WorkflowStore, reg *schema.Registry, lib *quills.Library, port int, webFS fs.FS) *Server {
	s := &Server{
		mux:       http.NewServeMux(),
		engine:    eng,
		store:     store,
		workflows: wf,
		registry:  reg,
		quills:    lib,
		port:      port,
		webFS:     webFS,
	}
	s.routes()
	return s
}

func (s *Server) routes() {
	s.mux.HandleFunc("POST /api/events", s.handlePostEvent)
	s.mux.HandleFunc("GET /api/events", s.handleGetEvents)
	s.mux.HandleFunc("DELETE /api/events", s.handleClearEvents)
	s.mux.HandleFunc("GET /api/workflows", s.handleListWorkflows)
	s.mux.HandleFunc("POST /api/workflows", s.handleCreateWorkflow)
	s.mux.HandleFunc("GET /api/workflows/{id}", s.handleGetWorkflow)
	s.mux.HandleFunc("PUT /api/workflows/{id}", s.handleUpdateWorkflow)
	s.mux.HandleFunc("DELETE /api/workflows/{id}", s.handleDeleteWorkflow)
	s.mux.HandleFunc("GET /api/schemas", s.handleGetSchemas)
	s.mux.HandleFunc("GET /api/quills", s.handleGetQuills)
	s.mux.HandleFunc("GET /api/quills/repo", s.handleQuillRepo)
	s.mux.HandleFunc("POST /api/quills/install", s.handleInstallQuill)
	s.mux.HandleFunc("POST /api/quills/install-manual", s.handleManualInstallQuill)
	s.mux.HandleFunc("DELETE /api/quills/{id}", s.handleUninstallQuill)
	s.mux.HandleFunc("GET /api/quills/{id}/settings", s.handleGetQuillSettings)
	s.mux.HandleFunc("PUT /api/quills/{id}/settings", s.handleSetQuillSettings)
	s.mux.HandleFunc("POST /api/quills/{id}/test-connection", s.handleTestConnection)
	s.mux.HandleFunc("POST /api/quills/{id}/load-options", s.handleLoadOptions)
	s.mux.HandleFunc("POST /api/workflows/{id}/run", s.handleRunWorkflow)
	s.mux.HandleFunc("GET /api/runs", s.handleGetRuns)
	s.mux.HandleFunc("DELETE /api/runs", s.handleClearRuns)
	s.mux.HandleFunc("GET /api/workflows/{id}/runs", s.handleGetWorkflowRuns)
	s.mux.HandleFunc("GET /api/actions", s.handleGetActions)
	s.mux.HandleFunc("GET /api/health", s.handleHealth)
	s.mux.HandleFunc("GET /api/version", s.handleVersion)
	s.mux.HandleFunc("GET /api/engaged", s.handleGetEngaged)
	s.mux.HandleFunc("PUT /api/engaged", s.handleSetEngaged)
	s.mux.HandleFunc("GET /api/download/inject.py", s.handleDownloadInjectPy)
	s.mux.HandleFunc("GET /api/download/scripts", s.handleListScripts)
	s.mux.HandleFunc("GET /api/download/scripts/{filename}", s.handleDownloadScript)
	s.mux.HandleFunc("GET /api/browse", s.handleBrowse)

	// Serve React SPA for all non-API routes.
	// In development, the React dev server handles this.
	// In production, we'll embed the build with go:embed.
	s.mux.HandleFunc("GET /", s.handleSPA)
}

// Addr returns the listen address.
func (s *Server) Addr() string {
	return fmt.Sprintf("localhost:%d", s.port)
}

// Start begins listening. This blocks.
func (s *Server) Start() error {
	addr := s.Addr()
	log.Printf("[server] Listening on http://%s", addr)
	return http.ListenAndServe(addr, corsMiddleware(s.mux))
}

// corsMiddleware allows cross-origin requests from the React dev server.
func corsMiddleware(next http.Handler) http.Handler {
	allowedOrigins := map[string]bool{
		"http://localhost:3000": true,
		"http://localhost:5173": true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// maxBodySize limits request body reads (1MB).
const maxBodySize = 1 << 20

// --- Event handlers ---

func (s *Server) handlePostEvent(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
	var evt engine.IncomingEvent
	if err := json.NewDecoder(r.Body).Decode(&evt); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if evt.Payload == nil {
		jsonError(w, "payload is required", http.StatusBadRequest)
		return
	}

	if err := s.engine.ProcessEvent(evt); err != nil {
		log.Printf("[server] Error processing event: %v", err)
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]string{"status": "accepted"})
}

func (s *Server) handleGetEvents(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	limit := 50
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}

	offset := 0
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	appFilter := q.Get("app")
	eventFilter := q.Get("event")

	events, err := s.store.QueryEvents(limit, offset, appFilter, eventFilter)
	if err != nil {
		jsonError(w, "failed to fetch events", http.StatusInternalServerError)
		return
	}

	total, err := s.store.CountEvents(appFilter, eventFilter)
	if err != nil {
		jsonError(w, "failed to count events", http.StatusInternalServerError)
		return
	}

	jsonOK(w, storage.EventsPage{
		Events: events,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	})
}

func (s *Server) handleClearEvents(w http.ResponseWriter, r *http.Request) {
	deleted, err := s.store.ClearEvents()
	if err != nil {
		jsonError(w, "failed to clear events", http.StatusInternalServerError)
		return
	}
	log.Printf("[server] Cleared %d event(s)", deleted)
	jsonOK(w, map[string]any{"status": "cleared", "deleted": deleted})
}

// --- Workflow handlers ---

func (s *Server) handleListWorkflows(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, s.workflows.List())
}

func (s *Server) handleCreateWorkflow(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
	var wf storage.Workflow
	if err := json.NewDecoder(r.Body).Decode(&wf); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	created, err := s.workflows.Create(wf)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (s *Server) handleGetWorkflow(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	wf, ok := s.workflows.Get(id)
	if !ok {
		jsonError(w, "workflow not found", http.StatusNotFound)
		return
	}
	jsonOK(w, wf)
}

func (s *Server) handleUpdateWorkflow(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
	id := r.PathValue("id")
	var wf storage.Workflow
	if err := json.NewDecoder(r.Body).Decode(&wf); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	updated, err := s.workflows.Update(id, wf)
	if err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, updated)
}

func (s *Server) handleDeleteWorkflow(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.workflows.Delete(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

// --- Schema handler ---

func (s *Server) handleGetSchemas(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, s.registry.Apps)
}

// --- Quills handler ---

func (s *Server) handleGetQuills(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, s.quills.List())
}

// --- Actions handler ---

func (s *Server) handleGetActions(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, s.engine.ActionsMeta())
}

// --- Health ---

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]any{
		"status":  "ok",
		"engaged": s.engine.Engaged(),
	})
}

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]string{"version": version.Version})
}

// --- Engaged toggle ---

func (s *Server) handleGetEngaged(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]bool{"engaged": s.engine.Engaged()})
}

func (s *Server) handleSetEngaged(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
	var body struct {
		Engaged bool `json:"engaged"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	s.engine.SetEngaged(body.Engaged)
	jsonOK(w, map[string]bool{"engaged": s.engine.Engaged()})
}

// --- SPA handler ---

func (s *Server) handleSPA(w http.ResponseWriter, r *http.Request) {
	if s.webFS == nil {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html>
<head><title>Quills</title></head>
<body>
<h1>Quills — Dev Mode</h1>
<p>Run the React dev server: <code>cd service/web &amp;&amp; bun dev</code></p>
<p>Then open <a href="http://localhost:3000">http://localhost:3000</a></p>
</body>
</html>`)
		return
	}

	// Serve static files from the embedded React build.
	// For SPA routing: if the file doesn't exist, serve index.html.
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}

	// Try serving the exact file.
	if _, err := fs.Stat(s.webFS, path); err == nil {
		http.FileServerFS(s.webFS).ServeHTTP(w, r)
		return
	}

	// Fallback to index.html for client-side routing.
	indexHTML, err := fs.ReadFile(s.webFS, "index.html")
	if err != nil {
		http.Error(w, "index.html not found", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html")
	w.Write(indexHTML)
}

// --- JSON helpers ---

func jsonOK(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
