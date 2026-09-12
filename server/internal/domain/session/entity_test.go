package session_test

import (
	"errors"
	"testing"
	"time"

	"palimpsesto/internal/domain/session"
)

func TestSessionDetectReuse(t *testing.T) {
	now := time.Now()
	past := now.Add(-time.Hour)
	future := now.Add(time.Hour)

	tests := []struct {
		name    string
		session session.Session
		wantErr error
	}{
		{
			name:    "revoked and not expired is reuse",
			session: session.Session{RevokedAt: &past, ExpiresAt: future},
			wantErr: session.ErrRefreshTokenReused,
		},
		{
			name:    "revoked and expired is still reuse, not staleness",
			session: session.Session{RevokedAt: &past, ExpiresAt: past},
			wantErr: session.ErrRefreshTokenReused,
		},
		{
			name:    "not revoked but expired",
			session: session.Session{RevokedAt: nil, ExpiresAt: past},
			wantErr: session.ErrInvalidRefreshToken,
		},
		{
			name:    "not revoked and not expired is usable",
			session: session.Session{RevokedAt: nil, ExpiresAt: future},
			wantErr: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.session.DetectReuse(now)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("want %v, got %v", tt.wantErr, err)
			}
		})
	}
}
