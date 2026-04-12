package releases

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"runtime"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 15 * time.Second}

const apiBase = "https://api.github.com/repos/shakedex/hedgebuddy"

// Release holds the fields we care about from the GitHub API.
type Release struct {
	TagName string  `json:"tag_name"`
	Assets  []Asset `json:"assets"`
}

// Asset is a single downloadable file in a release.
type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

// FindLatest returns the newest release whose tag matches tagPattern,
// along with the download URL for the asset matching assetName.
func FindLatest(tagPattern, assetName string) (version string, downloadURL string, err error) {
	re, err := regexp.Compile(tagPattern)
	if err != nil {
		return "", "", fmt.Errorf("invalid tag pattern %q: %w", tagPattern, err)
	}

	releases, err := listReleases()
	if err != nil {
		return "", "", err
	}

	for _, r := range releases {
		if !re.MatchString(r.TagName) {
			continue
		}
		// Found the right release — find the matching asset.
		for _, a := range r.Assets {
			if a.Name == assetName {
				version = strings.TrimLeft(r.TagName, "quillsv-")
				// Trim known prefixes properly.
				version = strings.TrimPrefix(r.TagName, "quills-v")
				version = strings.TrimPrefix(version, "v")
				return version, a.BrowserDownloadURL, nil
			}
		}
		return "", "", fmt.Errorf("release %s found but asset %q not present", r.TagName, assetName)
	}

	return "", "", fmt.Errorf("no release matching pattern %q found", tagPattern)
}

// AssetName returns the platform-appropriate asset filename for a given app.
//   - app: "quills" or "hedgebuddy"
func AssetName(app string) string {
	switch app {
	case "quills":
		if runtime.GOOS == "windows" {
			return "quills.exe"
		}
		return "quills"
	case "hedgebuddy":
		if runtime.GOOS == "windows" {
			return "HedgeBuddy.exe"
		}
		return "HedgeBuddy"
	}
	return app
}

// TagPattern returns the regex pattern to match release tags for a given app.
func TagPattern(app string) string {
	switch app {
	case "quills":
		return `^quills-v\d`
	case "hedgebuddy":
		return `^v\d`
	}
	return `^v\d`
}

func listReleases() ([]Release, error) {
	req, err := http.NewRequest("GET", apiBase+"/releases?per_page=20", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("github request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github returned status %d", resp.StatusCode)
	}

	var releases []Release
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return releases, nil
}
