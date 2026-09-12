package realtime

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"palimpsesto/internal/domain/user"
)

// TestHubNotifyUser protects the per-user notification channel: every
// tab the same user has open receives a push, a different user's tabs
// don't, and notifying a user with nothing connected is a silent no-op
// rather than a panic or a leaked room.
func TestHubNotifyUser(t *testing.T) {
	hub := NewHub()
	ctx := context.Background()
	alice := user.ID("alice")

	aliceServerConn1, aliceClientConn1 := newTestConnPair(t)
	hub.JoinUser(ctx, alice, aliceServerConn1)

	aliceServerConn2, aliceClientConn2 := newTestConnPair(t)
	hub.JoinUser(ctx, alice, aliceServerConn2)

	bobServerConn, bobClientConn := newTestConnPair(t)
	hub.JoinUser(ctx, "bob", bobServerConn)

	want, err := json.Marshal(NewInvitesChangedMessage())
	if err != nil {
		t.Fatalf("marshaling expected message: %v", err)
	}

	hub.NotifyUser(alice, want)

	if got := readTextMessage(t, aliceClientConn1); string(got) != string(want) {
		t.Fatalf("tab 1: want %q, got %q", want, got)
	}
	if got := readTextMessage(t, aliceClientConn2); string(got) != string(want) {
		t.Fatalf("tab 2: want %q, got %q", want, got)
	}

	readCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	if _, data, err := bobClientConn.Read(readCtx); err == nil {
		t.Fatalf("a different user's tab should not receive alice's notification, got %q", data)
	}
}

// TestHubNotifyUserWithNoConnection makes sure notifying a user nobody
// has connected for doesn't panic, and doesn't leave a stray empty room
// registered forever.
func TestHubNotifyUserWithNoConnection(t *testing.T) {
	hub := NewHub()

	hub.NotifyUser("nobody-connected", []byte("irrelevant"))

	if _, ok := hub.roomsByUser.get("nobody-connected"); ok {
		t.Fatal("want no room created for a user with no connection, got one")
	}
}

// TestHubLeaveUserDropsEmptyRoom protects JoinUser/LeaveUser's own
// room-per-user lifecycle, mirroring TestHubActiveDocumentUsers' checks
// on the document side.
func TestHubLeaveUserDropsEmptyRoom(t *testing.T) {
	hub := NewHub()
	ctx := context.Background()

	serverConn, _ := newTestConnPair(t)
	client := hub.JoinUser(ctx, "alice", serverConn)

	if _, ok := hub.roomsByUser.get("alice"); !ok {
		t.Fatal("want a room registered right after joining")
	}

	hub.LeaveUser(client)

	if _, ok := hub.roomsByUser.get("alice"); ok {
		t.Fatal("want the room dropped once its last client leaves")
	}
}
