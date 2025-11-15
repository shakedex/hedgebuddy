package validator

import (
	"fmt"
	"net/url"
	"os"
)

// ValidatePath checks if a path exists on the filesystem
func ValidatePath(path string) error {
	if path == "" {
		return fmt.Errorf("path cannot be empty")
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		return fmt.Errorf("path does not exist: %s", path)
	}
	return nil
}

// ValidateURL checks if a URL is well-formed with http/https scheme
func ValidateURL(urlStr string) error {
	if urlStr == "" {
		return fmt.Errorf("URL cannot be empty")
	}

	u, err := url.Parse(urlStr)
	if err != nil {
		return fmt.Errorf("invalid URL format: %w", err)
	}

	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("URL must use http or https scheme, got: %s", u.Scheme)
	}

	if u.Host == "" {
		return fmt.Errorf("URL must have a host")
	}

	return nil
}

// ValidateString checks if a string is non-empty
func ValidateString(s string) error {
	if s == "" {
		return fmt.Errorf("value cannot be empty")
	}
	return nil
}

// ValidateByType validates a value based on its type
func ValidateByType(value, varType string) error {
	switch varType {
	case "path":
		return ValidatePath(value)
	case "url":
		return ValidateURL(value)
	case "string", "secure":
		return ValidateString(value)
	default:
		return fmt.Errorf("unknown variable type: %s", varType)
	}
}

// ValidateVariableName checks if a variable name is valid
func ValidateVariableName(name string) error {
	if name == "" {
		return fmt.Errorf("variable name cannot be empty")
	}

	// Check for valid characters (alphanumeric, underscore, dash)
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-') {
			return fmt.Errorf("variable name contains invalid character: %c (use only letters, numbers, _, -)", c)
		}
	}

	return nil
}
