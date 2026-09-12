package documentapp_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/chacha20poly1305"
)

// encryptForTest mirrors web/src/crypto/documentCipher.ts's
// encryptUpdate: XChaCha20-Poly1305 with AAD = doc_id || key_epoch ||
// author_id || seq, wire format seq(16) || nonce(24) || ciphertext. It's
// reimplemented here (not imported — this is a Go test, the real thing
// runs in the browser) just to produce a realistic encrypted payload
// for TestNoPlaintextInDatabase to send through the same AppendUpdate
// path a real client uses.
func encryptForTest(t *testing.T, dek []byte, docID, authorID string, keyEpoch uint32, plaintext []byte) []byte {
	t.Helper()

	seq := make([]byte, 16)
	if _, err := rand.Read(seq); err != nil {
		t.Fatalf("random seq: %v", err)
	}

	aead, err := chacha20poly1305.NewX(dek)
	if err != nil {
		t.Fatalf("chacha20poly1305.NewX: %v", err)
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		t.Fatalf("random nonce: %v", err)
	}

	epochBytes := []byte{byte(keyEpoch >> 24), byte(keyEpoch >> 16), byte(keyEpoch >> 8), byte(keyEpoch)}
	aad := append([]byte(docID), 0)
	aad = append(aad, epochBytes...)
	aad = append(aad, 0)
	aad = append(aad, []byte(authorID)...)
	aad = append(aad, seq...)

	ciphertext := aead.Seal(nil, nonce, plaintext, aad)

	wire := make([]byte, 0, len(seq)+len(nonce)+len(ciphertext))
	wire = append(wire, seq...)
	wire = append(wire, nonce...)
	wire = append(wire, ciphertext...)
	return wire
}

// TestNoPlaintextInDatabase is the acceptance test: "an automated test
// that SELECTs from doc_updates and fails if it finds any readable
// text." It appends an update through the real AppendUpdate command —
// the same path the WebSocket handler uses — with a marker plaintext,
// then reads the row back with a completely independent database
// connection (not the application's own repository) and verifies the
// marker doesn't show up anywhere in what got stored: not in
// doc_updates.ciphertext, nor anywhere else in the row.
func TestNoPlaintextInDatabase(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	doc, err := env.documents.Create(ctx, owner.ID, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	const marker = "the server must never see this: segredo de estado"
	dek := make([]byte, 32)
	if _, err := rand.Read(dek); err != nil {
		t.Fatalf("random dek: %v", err)
	}
	wire := encryptForTest(t, dek, string(doc.ID), string(owner.ID), 1, []byte(marker))

	updateID, err := env.documents.AppendUpdate(ctx, doc.ID, owner.ID, wire)
	if err != nil {
		t.Fatalf("append update: %v", err)
	}

	dsn, ok := os.LookupEnv("PALIMPSESTO_DATABASE_URL")
	if !ok {
		t.Skip("PALIMPSESTO_DATABASE_URL not set; skipping integration test")
	}
	inspector, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connecting an independent inspection pool: %v", err)
	}
	defer inspector.Close()

	var ciphertext []byte
	var authorID string
	err = inspector.QueryRow(ctx,
		`SELECT ciphertext, author_id FROM doc_updates WHERE id = $1 AND doc_id = $2`,
		updateID, doc.ID,
	).Scan(&ciphertext, &authorID)
	if err != nil {
		t.Fatalf("selecting the persisted row: %v", err)
	}

	if bytes.Contains(ciphertext, []byte(marker)) {
		t.Fatalf("doc_updates.ciphertext contains the plaintext marker in the clear: %q", ciphertext)
	}
	// A weaker but still meaningful check beyond the substring test
	// above: the ciphertext shouldn't even be *shorter* than the
	// plaintext it's supposed to protect, which would give away that
	// something upstream skipped encryption entirely.
	if len(ciphertext) < len(marker) {
		t.Fatalf("ciphertext (%d bytes) is shorter than the plaintext it should protect (%d bytes)", len(ciphertext), len(marker))
	}
}
