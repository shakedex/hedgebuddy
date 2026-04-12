package download

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

var httpClient = &http.Client{Timeout: 10 * time.Minute}

// ToFile downloads url to destPath, printing progress to stdout.
// Returns the number of bytes written.
func ToFile(url, destPath string) (int64, error) {
	resp, err := httpClient.Get(url)
	if err != nil {
		return 0, fmt.Errorf("download request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("server returned status %d", resp.StatusCode)
	}

	f, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return 0, fmt.Errorf("create dest file: %w", err)
	}
	defer f.Close()

	total := resp.ContentLength
	written, err := io.Copy(&progressWriter{dest: f, total: total}, resp.Body)
	if err != nil {
		return written, fmt.Errorf("write: %w", err)
	}
	fmt.Println() // newline after progress bar
	return written, nil
}

type progressWriter struct {
	dest    io.Writer
	total   int64
	written int64
}

func (p *progressWriter) Write(b []byte) (int, error) {
	n, err := p.dest.Write(b)
	p.written += int64(n)
	if p.total > 0 {
		pct := float64(p.written) / float64(p.total) * 100
		fmt.Printf("\r  Downloading... %.1f%% (%d / %d bytes)", pct, p.written, p.total)
	} else {
		fmt.Printf("\r  Downloading... %d bytes", p.written)
	}
	return n, err
}
