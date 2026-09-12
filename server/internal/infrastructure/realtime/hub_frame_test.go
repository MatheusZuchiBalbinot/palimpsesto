package realtime

import (
	"bytes"
	"context"
	"encoding/binary"
	"testing"
	"time"

	"palimpsesto/internal/domain/document"
)

func TestDecodeClientFrame(t *testing.T) {
	t.Run("valid frame round-trips", func(t *testing.T) {
		payload := []byte("hello")
		raw := make([]byte, 1+4+len(payload))
		raw[0] = updateFrameType
		binary.BigEndian.PutUint32(raw[1:5], uint32(len(payload)))
		copy(raw[5:], payload)

		got, ok := DecodeClientFrame(raw)
		if !ok {
			t.Fatal("want a valid frame to decode")
		}
		if !bytes.Equal(got, payload) {
			t.Fatalf("want %q, got %q", payload, got)
		}
	})

	t.Run("too short to contain a header is rejected", func(t *testing.T) {
		if _, ok := DecodeClientFrame([]byte{0x01, 0x00}); ok {
			t.Fatal("want a too-short frame to be rejected")
		}
	})

	t.Run("wrong type byte is rejected", func(t *testing.T) {
		raw := make([]byte, 5)
		raw[0] = 0xFF
		if _, ok := DecodeClientFrame(raw); ok {
			t.Fatal("want a frame with the wrong type byte to be rejected")
		}
	})

	t.Run("length field not matching the actual payload is rejected", func(t *testing.T) {
		raw := make([]byte, 1+4+3)
		raw[0] = updateFrameType
		binary.BigEndian.PutUint32(raw[1:5], 99) // claims 99 bytes, only 3 follow
		if _, ok := DecodeClientFrame(raw); ok {
			t.Fatal("want a frame whose declared length doesn't match its actual payload to be rejected")
		}
	})
}

func TestEncodeUpdateFrame(t *testing.T) {
	authorID := [16]byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}
	payload := []byte("crdt bytes")

	got := encodeUpdateFrame(42, authorID, payload)

	if got[0] != updateFrameType {
		t.Fatalf("want frame type byte %d, got %d", updateFrameType, got[0])
	}
	if gotID := binary.BigEndian.Uint64(got[1:9]); gotID != 42 {
		t.Fatalf("want update id 42, got %d", gotID)
	}
	if !bytes.Equal(got[9:25], authorID[:]) {
		t.Fatalf("want author id %x, got %x", authorID, got[9:25])
	}
	gotLen := binary.BigEndian.Uint32(got[25:29])
	if int(gotLen) != len(payload) {
		t.Fatalf("want length %d, got %d", len(payload), gotLen)
	}
	if !bytes.Equal(got[29:], payload) {
		t.Fatalf("want payload %q, got %q", payload, got[29:])
	}
}

// TestHubSendUpdateAndSendText are Hub's single-recipient counterparts
// to broadcast — used for one-off pushes outside the room fan-out (see
// their doc comments in hub.go). Both silently drop instead of
// blocking when the recipient's buffer is full, same as broadcast.
func TestHubSendUpdateAndSendText(t *testing.T) {
	docID := document.ID("doc-1")
	client := newTestClient(t, "alice", docID)

	authorID := [16]byte{}
	hub := &Hub{roomsByDoc: newRoomRegistry(), roomsByUser: newUserRegistry(), conns: newConnLimiter()}

	hub.SendUpdate(client, 1, authorID, []byte("payload"))
	select {
	case f := <-client.send:
		if !f.binary {
			t.Fatal("want a binary frame from SendUpdate")
		}
	default:
		t.Fatal("want SendUpdate to have enqueued a frame")
	}

	hub.SendText(client, []byte(`{"t":"ping"}`))
	select {
	case f := <-client.send:
		if f.binary {
			t.Fatal("want a text frame from SendText")
		}
	default:
		t.Fatal("want SendText to have enqueued a frame")
	}
}

// TestClientEnqueueBlockingRespectsContext guards the join-time replay
// path: enqueueBlocking must give up and return the context's error
// once its deadline passes, rather than blocking forever on a
// permanently full buffer.
func TestClientEnqueueBlockingRespectsContext(t *testing.T) {
	docID := document.ID("doc-1")
	client := newTestClient(t, "alice", docID)

	for i := 0; i < sendBuffer; i++ {
		if !client.enqueue(frame{binary: false, data: []byte("filler")}) {
			t.Fatalf("filling buffer: enqueue %d unexpectedly failed", i)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	err := client.enqueueBlocking(ctx, frame{binary: false, data: []byte("one too many")})
	if err == nil {
		t.Fatal("want enqueueBlocking to fail once the context deadline passes on a full buffer")
	}
}
