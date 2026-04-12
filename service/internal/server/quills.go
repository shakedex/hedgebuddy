package server

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/shakedex/hedgebuddy/service/internal/quills"
	"github.com/shakedex/hedgebuddy/service/internal/storage"
)

// --- Quill repo browser ---

func (s *Server) handleQuillRepo(w http.ResponseWriter, r *http.Request) {
	repoURL := r.URL.Query().Get("repo")
	if repoURL == "" {
		repoURL = quills.DefaultRepoURL
	}

	index, err := s.quills.CheckUpdates(repoURL)
	if err != nil {
		jsonError(w, "failed to fetch quill repo: "+err.Error(), http.StatusBadGateway)
		return
	}

	jsonOK(w, index)
}

// --- Install quill ---

type installRequest struct {
	QuillID string `json:"quill_id"`
	RepoURL string `json:"repo_url"`
}

func (s *Server) handleInstallQuill(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)

	var req installRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.QuillID == "" {
		jsonError(w, "quill_id is required", http.StatusBadRequest)
		return
	}

	repoURL := req.RepoURL
	if repoURL == "" {
		repoURL = quills.DefaultRepoURL
	}

	installedDir := quills.InstalledDir(s.store.BaseDir())

	q, err := s.quills.Install(repoURL, req.QuillID, installedDir)
	if err != nil {
		log.Printf("[server] quill install error: %v", err)
		jsonError(w, "install failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	jsonOK(w, q)
}

// --- Manual install quill from uploaded files ---

// maxManualUpload limits the total multipart upload size (2MB).
const maxManualUpload = 2 << 20

func (s *Server) handleManualInstallQuill(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxManualUpload)

	ct := r.Header.Get("Content-Type")

	var yamlData []byte
	extraFiles := map[string][]byte{} // optional: main.py, requirements.txt

	if strings.HasPrefix(ct, "multipart/form-data") {
		if err := r.ParseMultipartForm(maxManualUpload); err != nil {
			jsonError(w, "failed to parse multipart form", http.StatusBadRequest)
			return
		}

		// Read required quill.yaml file.
		f, _, err := r.FormFile("quill_yaml")
		if err != nil {
			jsonError(w, "quill_yaml file is required", http.StatusBadRequest)
			return
		}
		defer f.Close()
		yamlData, err = io.ReadAll(io.LimitReader(f, 512<<10))
		if err != nil {
			jsonError(w, "failed to read quill_yaml", http.StatusBadRequest)
			return
		}

		// Read optional companion files.
		for _, name := range []string{"main_py", "requirements_txt"} {
			of, _, err := r.FormFile(name)
			if err != nil {
				continue // optional
			}
			defer of.Close()
			data, err := io.ReadAll(io.LimitReader(of, 1<<20))
			if err != nil {
				continue
			}
			// Map form field name → actual filename.
			actual := strings.ReplaceAll(name, "_", ".")
			extraFiles[actual] = data
		}
	} else {
		// Fallback: raw YAML body (backwards compat).
		var err error
		yamlData, err = io.ReadAll(r.Body)
		if err != nil {
			jsonError(w, "failed to read request body", http.StatusBadRequest)
			return
		}
	}

	if len(yamlData) == 0 {
		jsonError(w, "quill.yaml content is empty", http.StatusBadRequest)
		return
	}

	installedDir := quills.InstalledDir(s.store.BaseDir())

	q, err := s.quills.InstallFromYAML(yamlData, extraFiles, installedDir)
	if err != nil {
		log.Printf("[server] manual quill install error: %v", err)
		jsonError(w, "install failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	jsonOK(w, q)
}

// --- Uninstall quill ---

func (s *Server) handleUninstallQuill(w http.ResponseWriter, r *http.Request) {
	quillID := r.PathValue("id")
	if quillID == "" {
		jsonError(w, "quill ID required", http.StatusBadRequest)
		return
	}

	if err := s.quills.Uninstall(quillID); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	jsonOK(w, map[string]string{"status": "ok"})
}

// --- Workflow manual run ---

func (s *Server) handleRunWorkflow(w http.ResponseWriter, r *http.Request) {
	wfID := r.PathValue("id")
	if wfID == "" {
		jsonError(w, "workflow ID required", http.StatusBadRequest)
		return
	}

	wf, ok := s.workflows.Get(wfID)
	if !ok {
		jsonError(w, "workflow not found", http.StatusNotFound)
		return
	}

	// Build a synthetic test event with empty payload.
	testPayload := map[string]any{
		"_test":   true,
		"_source": "manual_run",
	}

	if err := s.engine.RunWorkflow(wf, testPayload); err != nil {
		log.Printf("[server] manual workflow run error: %v", err)
		jsonError(w, "run failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]string{"status": "ok"})
}

// --- Run history ---

func (s *Server) handleGetRuns(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	runs, err := s.store.RecentRuns(limit)
	if err != nil {
		jsonError(w, "failed to fetch runs", http.StatusInternalServerError)
		return
	}
	if runs == nil {
		runs = []storage.WorkflowRun{}
	}
	jsonOK(w, runs)
}

func (s *Server) handleGetWorkflowRuns(w http.ResponseWriter, r *http.Request) {
	wfID := r.PathValue("id")
	if wfID == "" {
		jsonError(w, "workflow ID required", http.StatusBadRequest)
		return
	}

	runs, err := s.store.RunsForWorkflow(wfID, 20)
	if err != nil {
		jsonError(w, "failed to fetch runs", http.StatusInternalServerError)
		return
	}
	if runs == nil {
		runs = []storage.WorkflowRun{}
	}
	jsonOK(w, runs)
}
