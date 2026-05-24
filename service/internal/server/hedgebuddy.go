package server

import (
	"log"
	"net/http"

	"github.com/shakedex/hedgebuddy/service/internal/actions"
	"github.com/shakedex/hedgebuddy/service/internal/hbvars"
)

type hbVariableResponse struct {
	Value       string `json:"value"`
	Type        string `json:"type"`
	Description string `json:"description,omitempty"`
}

type hbVarsResponse struct {
	Available bool                          `json:"available"`
	Profile   string                        `json:"profile,omitempty"`
	Variables map[string]hbVariableResponse `json:"variables"`
}

func (s *Server) handleGetHBVars(w http.ResponseWriter, _ *http.Request) {
	variables, err := hbvars.Load()
	if err != nil {
		jsonError(w, "failed to load HedgeBuddy variables", http.StatusInternalServerError)
		return
	}

	response := hbVarsResponse{
		Available: hbvars.Available(),
		Profile:   hbvars.ActiveProfile(),
		Variables: make(map[string]hbVariableResponse, len(variables)),
	}
	for name, variable := range variables {
		value := variable.Value
		if variable.Type == "secure" || variable.Type == "secret" {
			value = "••••"
		}
		response.Variables[name] = hbVariableResponse{
			Value:       value,
			Type:        normalizeHBType(variable.Type),
			Description: variable.Description,
		}
	}

	jsonOK(w, response)
}

func (s *Server) newHBContext(settings map[string]string) (*actions.Context, map[string]string) {
	hbValues, err := hbvars.LoadValues()
	if err != nil {
		log.Printf("[server] Warning: failed to load HedgeBuddy vars: %v", err)
		hbValues = make(map[string]string)
	}

	rawSettings := cloneStringMap(settings)
	ctx := &actions.Context{
		Settings: rawSettings,
		HBVars:   hbValues,
		Event:    make(map[string]any),
		Inputs:   make(map[string]string),
		Steps:    make(map[string]any),
	}

	resolvedSettings := make(map[string]string, len(rawSettings))
	for key, val := range rawSettings {
		resolvedSettings[key] = s.engine.ResolveTemplateString(val, ctx)
	}
	ctx.Settings = resolvedSettings

	return ctx, resolvedSettings
}

func cloneStringMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return make(map[string]string)
	}
	cloned := make(map[string]string, len(values))
	for key, val := range values {
		cloned[key] = val
	}
	return cloned
}

func normalizeHBType(t string) string {
	if t == "secure" {
		return "secret"
	}
	return t
}