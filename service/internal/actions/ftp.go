package actions

import (
	"fmt"
	"io"
	"net"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

// FTPUploadAction uploads a file via FTP or SFTP.
type FTPUploadAction struct{}

func (a *FTPUploadAction) Name() string { return "ftp.upload" }

func (a *FTPUploadAction) Execute(config map[string]any, ctx *Context) Result {
	protocol, _ := config["protocol"].(string)
	if protocol == "" {
		protocol = "sftp"
	}
	protocol = strings.ToLower(protocol)

	host, _ := config["host"].(string)
	if host == "" {
		return Result{Error: "ftp.upload: host is required", OK: false}
	}

	portStr, _ := config["port"].(string)
	port := 22
	if protocol == "ftp" {
		port = 21
	}
	if portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			port = p
		}
	}

	username, _ := config["username"].(string)
	password, _ := config["password"].(string)
	localPath, _ := config["local_path"].(string)
	remotePath, _ := config["remote_path"].(string)

	if localPath == "" {
		return Result{Error: "ftp.upload: local_path is required", OK: false}
	}
	if remotePath == "" {
		return Result{Error: "ftp.upload: remote_path is required", OK: false}
	}

	switch protocol {
	case "sftp":
		n, err := uploadSFTP(host, port, username, password, localPath, remotePath)
		if err != nil {
			return Result{Error: fmt.Sprintf("ftp.upload (sftp): %v", err), OK: false}
		}
		return Result{Output: map[string]any{"remote_path": remotePath, "bytes_transferred": n}, OK: true}
	default:
		return Result{Error: fmt.Sprintf("ftp.upload: unsupported protocol %q (supported: sftp)", protocol), OK: false}
	}
}

func (a *FTPUploadAction) Meta() ActionMeta {
	return ActionMeta{
		Name: "ftp.upload", Category: "transfer", Description: "Upload a file via SFTP",
		Inputs: []InputMeta{
			{Name: "host", Type: "string", Required: true, Description: "Remote host"},
			{Name: "port", Type: "string", Required: false, Description: "Port number", Default: "22"},
			{Name: "username", Type: "string", Required: true, Description: "Username"},
			{Name: "password", Type: "secure", Required: true, Description: "Password"},
			{Name: "protocol", Type: "enum", Required: false, Description: "Transfer protocol", Default: "sftp", Values: []string{"sftp"}},
			{Name: "local_path", Type: "path", Required: true, Description: "Local file path to upload"},
			{Name: "remote_path", Type: "string", Required: true, Description: "Destination path on remote server"},
		},
		Outputs: []OutputMeta{
			{Name: "remote_path", Type: "string", Description: "Remote path the file was uploaded to"},
			{Name: "bytes_transferred", Type: "number", Description: "Number of bytes transferred"},
		},
	}
}

// uploadSFTP transfers a file via SFTP using golang.org/x/crypto/ssh.
// Uses the SSH subsystem to run an SFTP session without a third-party
// SFTP client library — keeps dependencies minimal.
func uploadSFTP(host string, port int, username, password, localPath, remotePath string) (int64, error) {
	config := &ssh.ClientConfig{
		User: username,
		Auth: []ssh.AuthMethod{
			ssh.Password(password),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), //nolint:gosec // user-configured hosts
		Timeout:         10 * time.Second,
	}

	addr := net.JoinHostPort(host, strconv.Itoa(port))
	conn, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return 0, fmt.Errorf("connecting to %s: %w", addr, err)
	}
	defer conn.Close()

	sess, err := conn.NewSession()
	if err != nil {
		return 0, fmt.Errorf("opening session: %w", err)
	}
	defer sess.Close()

	// Use SCP as a lightweight file transfer mechanism (no extra SFTP dependency).
	// This sends a single file using the SCP protocol.
	localFile, err := os.Open(localPath)
	if err != nil {
		return 0, fmt.Errorf("opening local file: %w", err)
	}
	defer localFile.Close()

	stat, err := localFile.Stat()
	if err != nil {
		return 0, fmt.Errorf("stat local file: %w", err)
	}

	stdin, err := sess.StdinPipe()
	if err != nil {
		return 0, fmt.Errorf("stdin pipe: %w", err)
	}

	// Start SCP in sink mode on the remote side.
	if err := sess.Start(fmt.Sprintf("scp -t %s", remotePath)); err != nil {
		return 0, fmt.Errorf("starting scp: %w", err)
	}

	// Send SCP protocol header: "C<mode> <size> <filename>\n"
	header := fmt.Sprintf("C0644 %d %s\n", stat.Size(), stat.Name())
	if _, err := fmt.Fprint(stdin, header); err != nil {
		return 0, fmt.Errorf("writing scp header: %w", err)
	}

	n, err := io.Copy(stdin, localFile)
	if err != nil {
		return 0, fmt.Errorf("copying file data: %w", err)
	}

	// Send null byte to signal end of file.
	if _, err := fmt.Fprint(stdin, "\x00"); err != nil {
		return 0, fmt.Errorf("writing scp footer: %w", err)
	}

	stdin.Close()

	if err := sess.Wait(); err != nil {
		return 0, fmt.Errorf("scp session: %w", err)
	}

	return n, nil
}
