package actions

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// ── Shared HTTP helpers ─────────────────────────────────────────────────────

// applyAuth sets the Authorization header from the "auth" config field.
func applyAuth(req *http.Request, config map[string]any) {
	if auth, ok := config["auth"].(string); ok && auth != "" {
		req.Header.Set("Authorization", auth)
	}
}

// applyHeaders sets custom headers from config.
func applyHeaders(req *http.Request, config map[string]any) {
	if headers, ok := config["headers"].(map[string]any); ok {
		for k, v := range headers {
			req.Header.Set(k, fmt.Sprintf("%v", v))
		}
	}
}

// parseTimeout reads the "timeout" config field (e.g. "30s"), defaults to 30s.
func parseTimeout(config map[string]any) time.Duration {
	if t, ok := config["timeout"].(string); ok && t != "" {
		if d, err := time.ParseDuration(t); err == nil {
			return d
		}
	}
	return 30 * time.Second
}

// buildResponse reads the HTTP response, auto-parses JSON bodies, and returns
// a structured output map.
func buildResponse(resp *http.Response) map[string]any {
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MiB max

	// Collect headers into a flat map.
	headers := make(map[string]any, len(resp.Header))
	for k := range resp.Header {
		headers[k] = resp.Header.Get(k)
	}

	// Try to parse body as JSON; fall back to raw string.
	var body any
	if json.Valid(respBody) {
		var parsed any
		if err := json.Unmarshal(respBody, &parsed); err == nil {
			body = parsed
		} else {
			body = string(respBody)
		}
	} else {
		body = string(respBody)
	}

	return map[string]any{
		"status":  resp.StatusCode,
		"headers": headers,
		"body":    body,
	}
}

// doRequest is the shared core for GET/POST/PUT/PATCH/DELETE.
func doRequest(method string, config map[string]any, bodyReader io.Reader) Result {
	url, _ := config["url"].(string)
	if url == "" {
		return Result{Error: fmt.Sprintf("http.%s: url is required", method), OK: false}
	}

	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return Result{Error: fmt.Sprintf("http.%s: creating request: %v", method, err), OK: false}
	}

	applyAuth(req, config)
	applyHeaders(req, config)

	if bodyReader != nil && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{Timeout: parseTimeout(config)}
	resp, err := client.Do(req)
	if err != nil {
		return Result{Error: fmt.Sprintf("http.%s: %v", method, err), OK: false}
	}
	defer resp.Body.Close()

	output := buildResponse(resp)
	return Result{
		Output: output,
		OK:     resp.StatusCode >= 200 && resp.StatusCode < 300,
	}
}

// jsonBody marshals the "body" config field to a reader.
func jsonBody(config map[string]any) (io.Reader, error) {
	body, ok := config["body"]
	if !ok {
		return nil, nil
	}
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return bytes.NewReader(b), nil
}

// ── http.get ────────────────────────────────────────────────────────────────

// HTTPGetAction sends an HTTP GET request.
type HTTPGetAction struct{}

func (a *HTTPGetAction) Name() string { return "http.get" }

func (a *HTTPGetAction) Execute(config map[string]any, ctx *Context) Result {
	return doRequest("GET", config, nil)
}

// ── http.post ───────────────────────────────────────────────────────────────

// HTTPPostAction sends an HTTP POST request with a JSON body.
type HTTPPostAction struct{}

func (a *HTTPPostAction) Name() string { return "http.post" }

func (a *HTTPPostAction) Execute(config map[string]any, ctx *Context) Result {
	body, err := jsonBody(config)
	if err != nil {
		return Result{Error: fmt.Sprintf("http.post: encoding body: %v", err), OK: false}
	}
	return doRequest("POST", config, body)
}

// ── http.put ────────────────────────────────────────────────────────────────

// HTTPPutAction sends an HTTP PUT request with a JSON body.
type HTTPPutAction struct{}

func (a *HTTPPutAction) Name() string { return "http.put" }

func (a *HTTPPutAction) Execute(config map[string]any, ctx *Context) Result {
	body, err := jsonBody(config)
	if err != nil {
		return Result{Error: fmt.Sprintf("http.put: encoding body: %v", err), OK: false}
	}
	return doRequest("PUT", config, body)
}

// ── http.patch ──────────────────────────────────────────────────────────────

// HTTPPatchAction sends an HTTP PATCH request with a JSON body.
type HTTPPatchAction struct{}

func (a *HTTPPatchAction) Name() string { return "http.patch" }

func (a *HTTPPatchAction) Execute(config map[string]any, ctx *Context) Result {
	body, err := jsonBody(config)
	if err != nil {
		return Result{Error: fmt.Sprintf("http.patch: encoding body: %v", err), OK: false}
	}
	return doRequest("PATCH", config, body)
}

// ── http.delete ─────────────────────────────────────────────────────────────

// HTTPDeleteAction sends an HTTP DELETE request.
type HTTPDeleteAction struct{}

func (a *HTTPDeleteAction) Name() string { return "http.delete" }

func (a *HTTPDeleteAction) Execute(config map[string]any, ctx *Context) Result {
	body, err := jsonBody(config)
	if err != nil {
		return Result{Error: fmt.Sprintf("http.delete: encoding body: %v", err), OK: false}
	}
	return doRequest("DELETE", config, body)
}

// ── http.upload ─────────────────────────────────────────────────────────────

// HTTPUploadAction sends a multipart/form-data POST with a file and fields.
type HTTPUploadAction struct{}

func (a *HTTPUploadAction) Name() string { return "http.upload" }

func (a *HTTPUploadAction) Execute(config map[string]any, ctx *Context) Result {
	url, _ := config["url"].(string)
	if url == "" {
		return Result{Error: "http.upload: url is required", OK: false}
	}

	fileField, _ := config["file_field"].(string)
	if fileField == "" {
		fileField = "file"
	}

	filePath, _ := config["file_path"].(string)
	if filePath == "" {
		return Result{Error: "http.upload: file_path is required", OK: false}
	}

	f, err := os.Open(filePath)
	if err != nil {
		return Result{Error: fmt.Sprintf("http.upload: opening file: %v", err), OK: false}
	}
	defer f.Close()

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// Write the file part.
	part, err := writer.CreateFormFile(fileField, filepath.Base(filePath))
	if err != nil {
		return Result{Error: fmt.Sprintf("http.upload: creating form file: %v", err), OK: false}
	}
	if _, err := io.Copy(part, f); err != nil {
		return Result{Error: fmt.Sprintf("http.upload: copying file: %v", err), OK: false}
	}

	// Write additional form fields.
	if fields, ok := config["fields"].(map[string]any); ok {
		for k, v := range fields {
			if err := writer.WriteField(k, fmt.Sprintf("%v", v)); err != nil {
				return Result{Error: fmt.Sprintf("http.upload: writing field %s: %v", k, err), OK: false}
			}
		}
	}

	if err := writer.Close(); err != nil {
		return Result{Error: fmt.Sprintf("http.upload: finalizing form: %v", err), OK: false}
	}

	req, err := http.NewRequest("POST", url, &buf)
	if err != nil {
		return Result{Error: fmt.Sprintf("http.upload: creating request: %v", err), OK: false}
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	applyAuth(req, config)
	applyHeaders(req, config)

	client := &http.Client{Timeout: parseTimeout(config)}
	resp, err := client.Do(req)
	if err != nil {
		return Result{Error: fmt.Sprintf("http.upload: %v", err), OK: false}
	}
	defer resp.Body.Close()

	output := buildResponse(resp)
	return Result{
		Output: output,
		OK:     resp.StatusCode >= 200 && resp.StatusCode < 300,
	}
}
