package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/shakedex/hedgebuddy/service/internal/actions"
	"github.com/shakedex/hedgebuddy/service/internal/engine"
	"github.com/shakedex/hedgebuddy/service/internal/quills"
	"github.com/shakedex/hedgebuddy/service/internal/schema"
	"github.com/shakedex/hedgebuddy/service/internal/server"
	"github.com/shakedex/hedgebuddy/service/internal/storage"
	"github.com/shakedex/hedgebuddy/service/internal/tray"
)

//go:embed web/dist/*
var webDistFS embed.FS

const defaultPort = 12345

func main() {
	port := flag.Int("port", defaultPort, "HTTP server port")
	noBrowser := flag.Bool("no-browser", false, "Don't open browser on start")
	noTray := flag.Bool("no-tray", false, "Run without system tray (headless mode)")
	flag.Parse()

	// 1. Load event schema registry (embedded in binary).
	registry, err := schema.Load()
	if err != nil {
		log.Fatalf("Failed to load schemas: %v", err)
	}
	log.Printf("Loaded schemas for %d app(s)", len(registry.Apps))

	// 2. Initialize storage (SQLite event log).
	store, err := storage.New()
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}
	defer store.Close()
	log.Printf("Storage at %s", store.BaseDir())

	// 3. Load workflow store.
	workflows, err := storage.NewWorkflowStore(store.BaseDir())
	if err != nil {
		log.Fatalf("Failed to load workflows: %v", err)
	}
	log.Printf("Loaded %d workflow(s)", len(workflows.List()))

	// Clean up stale "running" runs from a previous crash.
	if cleaned, err := store.CleanupStaleRuns(); err != nil {
		log.Printf("Warning: failed to clean stale runs: %v", err)
	} else if cleaned > 0 {
		log.Printf("Cleaned up %d stale run(s) from previous session", cleaned)
	}

	// 4. Initialize action registry with built-in actions.
	actionRegistry := actions.NewRegistry()
	log.Printf("Registered %d built-in action(s)", len(actionRegistry.List()))

	// 5. Load quill library (built-in YAML quills).
	quillLib, err := quills.NewLibrary()
	if err != nil {
		log.Fatalf("Failed to load quills: %v", err)
	}

	// Load installed (community/custom) quills from disk.
	installedDir := store.BaseDir() + string(os.PathSeparator) + "installed"
	if err := quillLib.LoadInstalled(installedDir); err != nil {
		log.Printf("Warning: failed to load installed quills: %v", err)
	}
	log.Printf("Loaded %d quill(s)", len(quillLib.List()))

	// 6. Create the event processing engine.
	eng := engine.New(registry, store, workflows, actionRegistry, quillLib)

	// 7. Prepare embedded web UI (production) or nil (dev mode).
	var webFS fs.FS
	if sub, err := fs.Sub(webDistFS, "web/dist"); err == nil {
		// Check if the embedded build has an index.html.
		if _, err := fs.Stat(sub, "index.html"); err == nil {
			webFS = sub
			log.Println("Serving embedded web UI")
		}
	}
	if webFS == nil {
		log.Println("No embedded web build — run 'cd service/web && bun run build' then rebuild Go")
	}

	// 8. Create HTTP server.
	srv := server.New(eng, store, workflows, registry, quillLib, *port, webFS)

	if *noTray {
		// Headless mode: no system tray, just HTTP server.
		if !*noBrowser {
			tray.OpenDashboard(*port)
		}

		// Handle graceful shutdown.
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		go func() {
			<-sigCh
			fmt.Println("\nShutting down Quills service...")
			store.Close()
			os.Exit(0)
		}()

		// Start server (blocks).
		if err := srv.Start(); err != nil {
			log.Fatalf("Server error: %v", err)
		}
	} else {
		// Tray mode (default): system tray owns the main loop.
		mgr := tray.NewManager(*port, eng, store.BaseDir(), *noBrowser, func() {
			if err := srv.Start(); err != nil {
				log.Printf("Server error: %v", err)
			}
		}, func() {
			store.Close()
			os.Exit(0)
		})
		mgr.Run() // blocks
	}
}
