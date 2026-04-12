//go:build !windows && !darwin

package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func confirm(message string) bool {
	fmt.Println(message)
	fmt.Print("Install now? [y/N]: ")
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		return strings.EqualFold(strings.TrimSpace(scanner.Text()), "y")
	}
	return false
}

func showError(message string) {
	fmt.Fprintln(os.Stderr, "Error:", message)
}
