// Command api starts the HTTP server: wiring, configuration, and
// graceful shutdown.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"palimpsesto/internal/application/document"
	"palimpsesto/internal/application/user"
	"palimpsesto/internal/config"
	"palimpsesto/internal/infrastructure/persistence/postgres"
	"palimpsesto/internal/infrastructure/realtime"

	"palimpsesto/internal/interfaces/http"
	"palimpsesto/internal/interfaces/http/handlers"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	if err := run(logger); err != nil {
		logger.Error("exiting with error", "err", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	handlers.SetSecureCookies(cfg.SecureCookies)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := postgres.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	userRepo := postgres.NewUserRepository(pool)
	userKeysRepo := postgres.NewUserKeysRepository(pool)
	sessionRepo := postgres.NewSessionRepository(pool)
	documentRepo := postgres.NewDocumentRepository(pool)

	jwtSecret := []byte(cfg.JWTSecret)
	userService := userapp.NewService(userRepo, sessionRepo, userKeysRepo, jwtSecret)
	documentService := documentapp.NewService(documentRepo, documentRepo, documentRepo, documentRepo, documentRepo, documentRepo, documentRepo, documentRepo)
	hub := realtime.NewHub()

	handler := httpapi.NewRouter(logger, pool, userService, documentService, hub)

	srv := &http.Server{
		Addr:         string(cfg.Addr),
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("server listening", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	select {
	case <-ctx.Done():
		logger.Info("signal received, starting graceful shutdown")
	case err := <-errCh:
		return err
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}

	logger.Info("shutdown complete")
	return nil
}
