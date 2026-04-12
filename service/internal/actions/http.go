package actions

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// HTTPPostAction sends an HTTP POST request.
type HTTPPostAction struct{}

func (a *HTTPPostAction) Name() string { return "http.post" }

func (a *HTTPPostAction) Execute(config map[string]any, ctx *Context) Result {
	url, _ := config["url"].(string)
	if url == "" {
		return Result{Error: "http.post: url is required", OK: false}
	}

	var bodyBytes []byte
	if body, ok := config["body"]; ok {
		var err error
		bodyBytes, err = json.Marshal(body)
		if err != nil {
			return Result{Error: fmt.Sprintf("http.post: encoding body: %v", err), OK: false}
		}
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return Result{Error: fmt.Sprintf("http.post: creating request: %v", err), OK: false}
	}

	// Apply headers from config.
	if headers, ok := config["headers"].(map[string]any); ok {
		for k, v := range headers {
			req.Header.Set(k, fmt.Sprintf("%v", v))
		}
	}
	if req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return Result{Error: fmt.Sprintf("http.post: %v", err), OK: false}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1MB max

	return Result{
		Output: map[string]any{
			"status": resp.StatusCode,
			"body":   string(respBody),
		},
		OK: resp.StatusCode >= 200 && resp.StatusCode < 300,
	}
}

// HTTPGetAction sends an HTTP GET request.
type HTTPGetAction struct{}

func (a *HTTPGetAction) Name() string { return "http.get" }

func (a *HTTPGetAction) Execute(config map[string]any, ctx *Context) Result {
	url, _ := config["url"].(string)
	if url == "" {
		return Result{Error: "http.get: url is required", OK: false}
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return Result{Error: fmt.Sprintf("http.get: creating request: %v", err), OK: false}
	}

	if headers, ok := config["headers"].(map[string]any); ok {
		for k, v := range headers {
			req.Header.Set(k, fmt.Sprintf("%v", v))
		}
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return Result{Error: fmt.Sprintf("http.get: %v", err), OK: false}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	return Result{
		Output: map[string]any{
			"status": resp.StatusCode,
			"body":   string(respBody),
		},
		OK: resp.StatusCode >= 200 && resp.StatusCode < 300,
	}
}
