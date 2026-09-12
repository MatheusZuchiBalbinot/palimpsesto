package realtime

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// newTestClient performs a real websocket handshake (Room/Client always
// interact with a genuine *websocket.Conn, never a mock) and returns the
// server-side Client plus a cleanup that tears down both ends.
func newTestClient(t *testing.T, userID user.ID, docID document.ID) *Client {
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

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	clientConn, _, err := websocket.Dial(ctx, "ws"+srv.URL[len("http"):], nil)
	if err != nil {
		t.Fatalf("dialing test server: %v", err)
	}
	t.Cleanup(func() { _ = clientConn.CloseNow() })

	serverConn := <-serverConnCh
	t.Cleanup(func() { _ = serverConn.CloseNow() })

	return newClient(userID, docID, serverConn)
}

func TestRoomJoinLeave(t *testing.T) {
	docID := document.ID("doc-1")
	room := newRoom()

	alice := newTestClient(t, "alice", docID)
	bob := newTestClient(t, "bob", docID)

	room.join(alice)
	room.join(bob)
	if got := room.size(); got != 2 {
		t.Fatalf("want size 2, got %d", got)
	}

	room.leave(alice)
	if got := room.size(); got != 1 {
		t.Fatalf("want size 1 after leave, got %d", got)
	}
}

func TestRoomMemberIDsExcludesCaller(t *testing.T) {
	docID := document.ID("doc-1")
	room := newRoom()

	alice := newTestClient(t, "alice", docID)
	bob := newTestClient(t, "bob", docID)
	room.join(alice)
	room.join(bob)

	ids := room.memberIDs(alice)
	if len(ids) != 1 || ids[0] != "bob" {
		t.Fatalf("want [bob], got %v", ids)
	}
}

func TestRoomBroadcastExcludesSender(t *testing.T) {
	docID := document.ID("doc-1")
	room := newRoom()

	sender := newTestClient(t, "sender", docID)
	receiver := newTestClient(t, "receiver", docID)
	room.join(sender)
	room.join(receiver)

	room.broadcastText([]byte("hello"), sender)

	select {
	case f := <-sender.send:
		t.Fatalf("sender should not receive its own broadcast, got %v", f)
	default:
	}

	select {
	case f := <-receiver.send:
		if string(f.data) != "hello" {
			t.Fatalf("want %q, got %q", "hello", f.data)
		}
	default:
		t.Fatal("receiver should have gotten the broadcast frame")
	}
}

func TestRoomEvictsSlowConsumer(t *testing.T) {
	docID := document.ID("doc-1")
	room := newRoom()

	slow := newTestClient(t, "slow", docID)
	room.join(slow)

	// Fill the send buffer without draining it, then push one more frame —
	// enqueue should fail without blocking, and broadcast should evict
	// instead of blocking the room for everyone.
	for i := 0; i < sendBuffer; i++ {
		if !slow.enqueue(frame{binary: false, data: []byte("filler")}) {
			t.Fatalf("filling buffer: enqueue %d unexpectedly failed", i)
		}
	}

	room.broadcastText([]byte("one too many"), nil)

	if got := room.size(); got != 0 {
		t.Fatalf("want slow consumer evicted (size 0), got %d", got)
	}
}

// TestRoomEvictUserClosesOnlyThatUsersConnections is the acceptance
// test for revoking a member's already-open sockets: evictUser must
// force-close every connection the target user has open (they may have
// several tabs), while leaving every other client in the room untouched.
func TestRoomEvictUserClosesOnlyThatUsersConnections(t *testing.T) {
	docID := document.ID("doc-1")
	room := newRoom()

	removedTabOne := newTestClient(t, "removed", docID)
	removedTabTwo := newTestClient(t, "removed", docID)
	staying := newTestClient(t, "staying", docID)
	room.join(removedTabOne)
	room.join(removedTabTwo)
	room.join(staying)

	room.evictUser("removed")

	if got := room.size(); got != 1 {
		t.Fatalf("want 1 client left in the room, got %d", got)
	}
	ids := room.memberIDs(nil)
	if len(ids) != 1 || ids[0] != "staying" {
		t.Fatalf("want only [staying] left, got %v", ids)
	}

	// 5s: under a full `-race` run across the whole module, CPU
	// contention from every other package's tests can push this well
	// past a couple of seconds — see the identical note on
	// TestHubEvictDocumentMemberClosesOnlyThatUsersConnection.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, _, err := removedTabOne.conn.Read(ctx); err == nil {
		t.Fatal("want the removed user's first connection to be closed")
	}
	if _, _, err := removedTabTwo.conn.Read(ctx); err == nil {
		t.Fatal("want the removed user's second connection to be closed")
	}
}

func TestRoomConcurrentJoinLeaveBroadcast(t *testing.T) {
	docID := document.ID("doc-1")
	room := newRoom()

	const clientCount = 20
	clients := make([]*Client, clientCount)
	for i := range clients {
		clients[i] = newTestClient(t, user.ID(string(rune('a'+i))), docID)
		room.join(clients[i])
	}

	var wg sync.WaitGroup
	for _, c := range clients {
		wg.Add(2)
		go func(c *Client) {
			defer wg.Done()
			room.broadcastText([]byte("x"), c)
		}(c)
		go func(c *Client) {
			defer wg.Done()
			room.leave(c)
			room.join(c)
		}(c)
	}
	wg.Wait()
}
