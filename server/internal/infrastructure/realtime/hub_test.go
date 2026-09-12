package realtime

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"

	"palimpsesto/internal/domain/document"
)

// newTestConnPair performs a real websocket handshake and returns both
// ends: the server-side connection for use with Hub.Join (which starts a
// real write-pump goroutine draining the resulting Client's send channel
// — so a test must read the wire itself, never peek at that channel
// directly, or it races the write pump for the same frame), and the
// client-side connection for reading what the server actually wrote.
func newTestConnPair(t *testing.T) (serverConn, clientConn *websocket.Conn) {
	t.Helper()

	serverConnCh := make(chan *websocket.Conn, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		serverConnCh <- conn
		<-r.Context().Done()
	}))
	t.Cleanup(srv.Close)

	dialCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	clientConn, _, err := websocket.Dial(dialCtx, "ws"+srv.URL[len("http"):], nil)
	if err != nil {
		t.Fatalf("dialing test server: %v", err)
	}
	t.Cleanup(func() { _ = clientConn.CloseNow() })

	serverConn = <-serverConnCh
	t.Cleanup(func() { _ = serverConn.CloseNow() })
	return serverConn, clientConn
}

// readTextMessage reads a text frame off conn's wire, failing the test if
// none arrives within a second.
func readTextMessage(t *testing.T, conn *websocket.Conn) []byte {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	typ, data, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("reading from test connection: %v", err)
	}
	if typ != websocket.MessageText {
		t.Fatalf("want a text frame, got message type %v", typ)
	}
	return data
}

// TestHubJoinBroadcastsMemberJoined is the counterpart to Leave's
// "member_left" broadcast: everyone already in the room needs to know a
// new member arrived without having to reconnect themselves — see the
// asymmetry this fixed in Join in hub.go.
func TestHubJoinBroadcastsMemberJoined(t *testing.T) {
	docID := document.ID("doc-1")
	hub := NewHub()
	ctx := context.Background()

	aliceServerConn, aliceClientConn := newTestConnPair(t)
	hub.Join(ctx, docID, "alice", aliceServerConn)

	bobServerConn, bobClientConn := newTestConnPair(t)
	hub.Join(ctx, docID, "bob", bobServerConn)

	want, err := json.Marshal(NewMemberJoinedMessage("bob"))
	if err != nil {
		t.Fatalf("marshaling expected message: %v", err)
	}

	got := readTextMessage(t, aliceClientConn)
	if string(got) != string(want) {
		t.Fatalf("want %q, got %q", want, got)
	}

	// The joiner itself should not receive its own member_joined notice —
	// bob's next message, if any, should be something else (or nothing
	// within the read deadline below).
	readCtx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	if _, data, err := bobClientConn.Read(readCtx); err == nil {
		t.Fatalf("the joiner itself should not receive its own member_joined notice, got %q", data)
	}
}

// TestHubLeaveBroadcastsMemberLeft protects the existing counterpart so a
// future change doesn't silently break one side of the pair.
func TestHubLeaveBroadcastsMemberLeft(t *testing.T) {
	docID := document.ID("doc-1")
	hub := NewHub()
	ctx := context.Background()

	aliceServerConn, aliceClientConn := newTestConnPair(t)
	hub.Join(ctx, docID, "alice", aliceServerConn)

	bobServerConn, _ := newTestConnPair(t)
	bob := hub.Join(ctx, docID, "bob", bobServerConn)

	// Drain the member_joined notice alice received about bob so it
	// doesn't interfere with the member_left check below.
	readTextMessage(t, aliceClientConn)

	hub.Leave(bob)

	want, err := json.Marshal(NewMemberLeftMessage("bob"))
	if err != nil {
		t.Fatalf("marshaling expected message: %v", err)
	}

	got := readTextMessage(t, aliceClientConn)
	if string(got) != string(want) {
		t.Fatalf("want %q, got %q", want, got)
	}
}

// TestHubActiveDocumentUsers protects the document list's "so-and-so is
// editing this now" indicator: only documents with an active connection
// come back (with who is actually connected), restricted to the passed
// candidates, and a document that drops to zero connections stops
// counting as active.
func TestHubActiveDocumentUsers(t *testing.T) {
	activeDocID := document.ID("doc-active")
	idleDocID := document.ID("doc-idle")
	uninvolvedDocID := document.ID("doc-not-a-candidate")
	hub := NewHub()
	ctx := context.Background()

	aliceServerConn, _ := newTestConnPair(t)
	client := hub.Join(ctx, activeDocID, "alice", aliceServerConn)

	bobServerConn, _ := newTestConnPair(t)
	hub.Join(ctx, activeDocID, "bob", bobServerConn)

	idleServerConn, _ := newTestConnPair(t)
	idleClient := hub.Join(ctx, idleDocID, "carol", idleServerConn)
	hub.Leave(idleClient)

	candidates := []document.ID{activeDocID, idleDocID}
	got := hub.ActiveDocumentUsers(candidates)
	if len(got) != 1 {
		t.Fatalf("want only %q active, got %v", activeDocID, got)
	}
	gotUsers := got[activeDocID]
	if len(gotUsers) != 2 {
		t.Fatalf("want alice and bob connected to %q, got %v", activeDocID, gotUsers)
	}

	// A document nobody asked about should never come back, even if it's
	// active — this only answers for the caller's own candidates.
	notCandidate := hub.ActiveDocumentUsers([]document.ID{uninvolvedDocID})
	if len(notCandidate) != 0 {
		t.Fatalf("want no active documents among candidates that weren't asked about, got %v", notCandidate)
	}

	hub.Leave(client)
	gotAfterOneLeaves := hub.ActiveDocumentUsers(candidates)
	if len(gotAfterOneLeaves[activeDocID]) != 1 || gotAfterOneLeaves[activeDocID][0] != "bob" {
		t.Fatalf("want only bob left on %q, got %v", activeDocID, gotAfterOneLeaves[activeDocID])
	}
}

// TestHubEvictDocumentMemberClosesOnlyThatUsersConnection is the
// acceptance test for the fix to revocation not being immediate for an
// already-open socket: after RemoveMemberAndRotate, the removed member's
// live connection must be forcibly closed, while everyone else on the
// same document stays connected.
func TestHubEvictDocumentMemberClosesOnlyThatUsersConnection(t *testing.T) {
	docID := document.ID("doc-1")
	hub := NewHub()
	ctx := context.Background()

	removedServerConn, removedClientConn := newTestConnPair(t)
	hub.Join(ctx, docID, "removed", removedServerConn)

	stayingServerConn, _ := newTestConnPair(t)
	hub.Join(ctx, docID, "staying", stayingServerConn)

	hub.EvictDocumentMember(docID, "removed")

	// 5s, not 2s: under `go test ./... -race` across the whole module,
	// CPU contention from every other package's tests running
	// concurrently can push this well past a couple of seconds even
	// though the close itself is immediate — this asserts the close
	// happens at all, not how fast.
	readCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, _, err := removedClientConn.Read(readCtx); err == nil {
		t.Fatal("want the removed member's connection to be closed")
	}

	remaining := hub.ActiveDocumentUsers([]document.ID{docID})[docID]
	if len(remaining) != 1 || remaining[0] != "staying" {
		t.Fatalf("want only staying left on the document, got %v", remaining)
	}
}

// TestHubEvictDocumentMemberIsANoOpForAnUnknownRoom guards against a
// panic or spurious room creation when evicting from a document nobody
// is currently connected to (e.g. the removed member's last tab already
// closed on its own).
func TestHubEvictDocumentMemberIsANoOpForAnUnknownRoom(t *testing.T) {
	hub := NewHub()
	hub.EvictDocumentMember("doc-nobody-is-on", "someone")
}

// TestHubConnectionLimitPerUser is the acceptance test for the per-user
// connection cap: once a user hits maxConnectionsPerUser, a further
// AcquireConnectionSlot call must fail, and releasing one must free up
// exactly one more slot.
func TestHubConnectionLimitPerUser(t *testing.T) {
	hub := NewHub()

	for i := 0; i < maxConnectionsPerUser; i++ {
		if !hub.AcquireConnectionSlot("alice") {
			t.Fatalf("acquire %d: want a free slot under the cap", i)
		}
	}
	if hub.AcquireConnectionSlot("alice") {
		t.Fatal("want the cap to reject one more connection for the same user")
	}

	// A different user has their own, independent budget.
	if !hub.AcquireConnectionSlot("bob") {
		t.Fatal("want a different user to have their own connection budget")
	}

	hub.ReleaseConnectionSlot("alice")
	if !hub.AcquireConnectionSlot("alice") {
		t.Fatal("want a slot freed by release to be acquirable again")
	}
}
