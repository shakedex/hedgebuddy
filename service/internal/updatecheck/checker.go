package updatecheck

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 10 * time.Second}

const apiBase = "https://api.github.com/repos/shakedex/hedgebuddy"

type release struct {
	TagName string `json:"tag_name"`
}

// CheckQuillsUpdate checks for a newer release tagged quills-v* on GitHub.
func CheckQuillsUpdate(current string) (latest string, outdated bool, err error) {
	return checkUpdate(current, regexp.MustCompile(`^quills-v(\d.*)`), "quills-v")
}

// CheckHedgeBuddyUpdate checks for a newer release tagged v* on GitHub.
// If current is empty, it only fetches the latest version without comparing.
func CheckHedgeBuddyUpdate(current string) (latest string, outdated bool, err error) {
	if current == "" {
		return "", false, nil
	}
	return checkUpdate(current, regexp.MustCompile(`^v(\d.*)`), "v")
}

func checkUpdate(current string, tagRe *regexp.Regexp, prefix string) (string, bool, error) {
	req, err := http.NewRequest("GET", apiBase+"/releases?per_page=20", nil)
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

	var releases []release
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return "", false, fmt.Errorf("decode: %w", err)
	}

	for _, r := range releases {
		m := tagRe.FindStringSubmatch(r.TagName)
		if m == nil {
			continue
		}
		latest := m[1]
		_ = prefix
		if CompareVersions(latest, current) > 0 {
			return latest, true, nil
		}
		return latest, false, nil
	}

	return current, false, nil
}

// CompareVersions returns >0 if a > b, <0 if a < b, 0 if equal.
func CompareVersions(a, b string) int {
	ap := parseVer(a)
	bp := parseVer(b)
	for i := 0; i < len(ap) || i < len(bp); i++ {
		av, bv := 0, 0
		if i < len(ap) {
			av = ap[i]
		}
		if i < len(bp) {
			bv = bp[i]
		}
		if av != bv {
			return av - bv
		}
	}
	return 0
}

func parseVer(v string) []int {
	v = strings.TrimPrefix(v, "v")
	parts := strings.Split(v, ".")
	nums := make([]int, 0, len(parts))
	for _, p := range parts {
		n, _ := strconv.Atoi(p)
		nums = append(nums, n)
	}
	return nums
}
