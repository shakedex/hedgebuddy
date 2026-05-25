package ui

// App metadata
const (
	AppName    = "HedgeBuddy"
	AppVersion = "0.10.0"

	WindowTitle  = "HedgeBuddy"
	WindowWidth  = 1024
	WindowHeight = 768

	GithubURL  = "https://github.com/shakedex/hedgebuddy"
	WebsiteURL = "https://shaked.co"
)

// Variable types — single source of truth used by UI, validators, and storage
const (
	TypeString = "string"
	TypePath   = "path"
	TypeURL    = "url"
	TypeSecret = "secret"
)

// AllTypes returns the ordered list of variable types for UI selectors
func AllTypes() []string {
	return []string{TypeString, TypePath, TypeURL, TypeSecret}
}
