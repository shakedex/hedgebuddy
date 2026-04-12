package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	_ "modernc.org/sqlite"
)

// EventRecord is a single event stored in the log.
type EventRecord struct {
	ID         int64           `json:"id"`
	AppID      string          `json:"app_id"`
	EventName  string          `json:"event_name"`
	Payload    json.RawMessage `json:"payload"`
	ReceivedAt time.Time       `json:"received_at"`
}

// Store manages persistent storage for events, workflows, and config.
type Store struct {
	db      *sql.DB
	baseDir string
}

// DataDir returns the platform-specific storage directory for Quills.
func DataDir() (string, error) {
	var base string
	switch runtime.GOOS {
	case "windows":
		base = os.Getenv("APPDATA")
		if base == "" {
			return "", fmt.Errorf("APPDATA not set")
		}
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		base = filepath.Join(home, "Library", "Application Support")
	default:
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		base = filepath.Join(home, ".config")
	}
	return filepath.Join(base, "HedgeBuddy", "quills"), nil
}

// New creates or opens the Quills storage at the platform-specific location.
func New() (*Store, error) {
	dir, err := DataDir()
	if err != nil {
		return nil, fmt.Errorf("resolving data dir: %w", err)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("creating data dir: %w", err)
	}

	dbPath := filepath.Join(dir, "events.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("opening database: %w", err)
	}

	s := &Store{db: db, baseDir: dir}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrating database: %w", err)
	}

	return s, nil
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS events (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			app_id      TEXT NOT NULL,
			event_name  TEXT NOT NULL,
			payload     TEXT NOT NULL,
			received_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_events_app      ON events(app_id);
		CREATE INDEX IF NOT EXISTS idx_events_name     ON events(event_name);
		CREATE INDEX IF NOT EXISTS idx_events_received ON events(received_at);

		CREATE TABLE IF NOT EXISTS workflow_runs (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			workflow_id TEXT NOT NULL,
			workflow_name TEXT NOT NULL,
			status      TEXT NOT NULL,
			error       TEXT,
			started_at  TEXT NOT NULL,
			finished_at TEXT,
			steps_log   TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_runs_wf   ON workflow_runs(workflow_id);
		CREATE INDEX IF NOT EXISTS idx_runs_time ON workflow_runs(started_at);
	`)
	return err
}

// InsertEvent stores a new event and returns its ID.
func (s *Store) InsertEvent(appID, eventName string, payload json.RawMessage, receivedAt time.Time) (int64, error) {
	res, err := s.db.Exec(
		`INSERT INTO events (app_id, event_name, payload, received_at) VALUES (?, ?, ?, ?)`,
		appID, eventName, string(payload), receivedAt.UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// RecentEvents returns the latest N events, newest first.
func (s *Store) RecentEvents(limit int) ([]EventRecord, error) {
	return s.QueryEvents(limit, 0, "", "")
}

// EventsPage is a paginated response containing events and the total count.
type EventsPage struct {
	Events []EventRecord `json:"events"`
	Total  int           `json:"total"`
	Limit  int           `json:"limit"`
	Offset int           `json:"offset"`
}

// QueryEvents returns events with pagination and optional filters.
func (s *Store) QueryEvents(limit, offset int, appFilter, eventFilter string) ([]EventRecord, error) {
	query := `SELECT id, app_id, event_name, payload, received_at FROM events`
	countQuery := `SELECT COUNT(*) FROM events`
	var args []any
	var where []string

	if appFilter != "" {
		where = append(where, "app_id = ?")
		args = append(args, appFilter)
	}
	if eventFilter != "" {
		where = append(where, "event_name = ?")
		args = append(args, eventFilter)
	}

	if len(where) > 0 {
		clause := " WHERE " + where[0]
		for _, w := range where[1:] {
			clause += " AND " + w
		}
		query += clause
		countQuery += clause
	}

	query += " ORDER BY id DESC LIMIT ? OFFSET ?"
	queryArgs := append(args, limit, offset)

	rows, err := s.db.Query(query, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []EventRecord
	for rows.Next() {
		var rec EventRecord
		var payloadStr string
		var receivedStr string
		if err := rows.Scan(&rec.ID, &rec.AppID, &rec.EventName, &payloadStr, &receivedStr); err != nil {
			return nil, err
		}
		rec.Payload = json.RawMessage(payloadStr)
		rec.ReceivedAt, _ = time.Parse(time.RFC3339Nano, receivedStr)
		events = append(events, rec)
	}
	return events, rows.Err()
}

// CountEvents returns the total event count with optional filters.
func (s *Store) CountEvents(appFilter, eventFilter string) (int, error) {
	query := `SELECT COUNT(*) FROM events`
	var args []any
	var where []string

	if appFilter != "" {
		where = append(where, "app_id = ?")
		args = append(args, appFilter)
	}
	if eventFilter != "" {
		where = append(where, "event_name = ?")
		args = append(args, eventFilter)
	}

	if len(where) > 0 {
		clause := " WHERE " + where[0]
		for _, w := range where[1:] {
			clause += " AND " + w
		}
		query += clause
	}

	var count int
	err := s.db.QueryRow(query, args...).Scan(&count)
	return count, err
}

// Close closes the database.
func (s *Store) Close() error {
	return s.db.Close()
}

// BaseDir returns the storage directory path.
func (s *Store) BaseDir() string {
	return s.baseDir
}

// WorkflowRun is a single execution record for a workflow.
type WorkflowRun struct {
	ID           int64  `json:"id"`
	WorkflowID   string `json:"workflow_id"`
	WorkflowName string `json:"workflow_name"`
	Status       string `json:"status"` // "running", "success", "error"
	Error        string `json:"error,omitempty"`
	StartedAt    string `json:"started_at"`
	FinishedAt   string `json:"finished_at,omitempty"`
	StepsLog     string `json:"steps_log,omitempty"` // JSON array of step results
}

// InsertRun creates a new workflow run record and returns its ID.
func (s *Store) InsertRun(workflowID, workflowName, status, startedAt string) (int64, error) {
	res, err := s.db.Exec(
		`INSERT INTO workflow_runs (workflow_id, workflow_name, status, started_at) VALUES (?, ?, ?, ?)`,
		workflowID, workflowName, status, startedAt,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// FinishRun updates a run with its final status.
func (s *Store) FinishRun(runID int64, status, errMsg, finishedAt, stepsLog string) error {
	_, err := s.db.Exec(
		`UPDATE workflow_runs SET status = ?, error = ?, finished_at = ?, steps_log = ? WHERE id = ?`,
		status, errMsg, finishedAt, stepsLog, runID,
	)
	return err
}

// RecentRuns returns the latest workflow runs.
func (s *Store) RecentRuns(limit int) ([]WorkflowRun, error) {
	rows, err := s.db.Query(
		`SELECT id, workflow_id, workflow_name, status, COALESCE(error,''), started_at, COALESCE(finished_at,''), COALESCE(steps_log,'')
		 FROM workflow_runs ORDER BY id DESC LIMIT ?`, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []WorkflowRun
	for rows.Next() {
		var r WorkflowRun
		if err := rows.Scan(&r.ID, &r.WorkflowID, &r.WorkflowName, &r.Status, &r.Error, &r.StartedAt, &r.FinishedAt, &r.StepsLog); err != nil {
			return nil, err
		}
		runs = append(runs, r)
	}
	return runs, rows.Err()
}

// CleanupStaleRuns marks any "running" runs as errors on startup (they were interrupted).
func (s *Store) CleanupStaleRuns() (int64, error) {
	res, err := s.db.Exec(
		`UPDATE workflow_runs SET status = 'error', error = 'interrupted: service restarted', finished_at = ? WHERE status = 'running'`,
		time.Now().UTC().Format(time.RFC3339),
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// RunsForWorkflow returns recent runs for a specific workflow.
func (s *Store) RunsForWorkflow(workflowID string, limit int) ([]WorkflowRun, error) {
	rows, err := s.db.Query(
		`SELECT id, workflow_id, workflow_name, status, COALESCE(error,''), started_at, COALESCE(finished_at,''), COALESCE(steps_log,'')
		 FROM workflow_runs WHERE workflow_id = ? ORDER BY id DESC LIMIT ?`, workflowID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []WorkflowRun
	for rows.Next() {
		var r WorkflowRun
		if err := rows.Scan(&r.ID, &r.WorkflowID, &r.WorkflowName, &r.Status, &r.Error, &r.StartedAt, &r.FinishedAt, &r.StepsLog); err != nil {
			return nil, err
		}
		runs = append(runs, r)
	}
	return runs, rows.Err()
}
