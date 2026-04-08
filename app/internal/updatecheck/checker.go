package updatecheck

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 10 * time.Second}

// CheckAppUpdate checks the latest GitHub release tag against currentVersion.
// Returns the latest version string and whether an update is available.
// Errors are returned but callers should treat them as non-fatal.
func CheckAppUpdate(currentVersion string) (latest string, outdated bool, err error) {
	req, err := http.NewRequest("GET",
		"https://api.github.com/repos/shakedex/hedgebuddy/releases/latest", nil)
	if err != nil {
		return "", false, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", false, fmt.Errorf("github request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", false, fmt.Errorf("github returned status %d", resp.StatusCode)
	}

	var release struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return "", false, fmt.Errorf("decode response: %w", err)
	}

	latest = strings.TrimPrefix(release.TagName, "v")
	if CompareVersions(latest, currentVersion) > 0 {
		return latest, true, nil
	}
	return latest, false, nil
}

// CheckPyPIUpdate checks the installed hedgebuddy library version against PyPI.
// executable is the Python interpreter path (e.g. "py", "python3").
func CheckPyPIUpdate(executable string) (installed, latest string, outdated bool, err error) {
	// Get installed version
	out, err := exec.Command(executable, "-c",
		"import hedgebuddy; print(hedgebuddy.__version__)").Output()
	if err != nil {
		return "", "", false, fmt.Errorf("could not get installed version: %w", err)
	}
	installed = strings.TrimSpace(string(out))

	// Get latest from PyPI
	resp, err := httpClient.Get("https://pypi.org/pypi/hedgebuddy/json")
	if err != nil {
		return installed, "", false, fmt.Errorf("pypi request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return installed, "", false, fmt.Errorf("pypi returned status %d", resp.StatusCode)
	}

	var pypi struct {
		Info struct {
			Version string `json:"version"`
		} `json:"info"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&pypi); err != nil {
		return installed, "", false, fmt.Errorf("decode response: %w", err)
	}

	latest = pypi.Info.Version
	if CompareVersions(latest, installed) > 0 {
		return installed, latest, true, nil
	}
	return installed, latest, false, nil
}

// CompareVersions compares two semver-style version strings (e.g. "0.7.0").
// Returns >0 if a > b, <0 if a < b, 0 if equal.
func CompareVersions(a, b string) int {
	aParts := parseVersion(a)
	bParts := parseVersion(b)
	for i := 0; i < len(aParts) || i < len(bParts); i++ {
		av, bv := 0, 0
		if i < len(aParts) {
			av = aParts[i]
		}
		if i < len(bParts) {
			bv = bParts[i]
		}
		if av != bv {
			return av - bv
		}
	}
	return 0
}

func parseVersion(v string) []int {
	v = strings.TrimPrefix(v, "v")
	parts := strings.Split(v, ".")
	nums := make([]int, 0, len(parts))
	for _, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil {
			nums = append(nums, 0)
		} else {
			nums = append(nums, n)
		}
	}
	return nums
}
