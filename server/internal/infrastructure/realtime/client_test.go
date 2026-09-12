package realtime

import (
	"context"
	"testing"
	"time"
)

// TestEnqueueBlockingDoesNotDropPastBufferCapacity is the regression test
// for the join-time data-loss bug: sending more frames than sendBuffer
// holds must eventually deliver all of them, never silently drop what
// didn't fit — unlike enqueue, whose whole purpose is to drop instead of
// block.
func TestEnqueueBlockingDoesNotDropPastBufferCapacity(t *testing.T) {
	serverConn, clientConn := newTestConnPair(t)
	client := newClient("alice", "doc-1", serverConn)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go client.runWritePump(ctx)

	const frameCount = sendBuffer * 3 // comfortably more than the buffer alone could hold

	done := make(chan error, 1)
	go func() {
		for i := 0; i < frameCount; i++ {
			if err := client.enqueueBlocking(ctx, frame{binary: false, data: []byte{byte(i)}}); err != nil {
				done <- err
				return
			}
		}
		done <- nil
	}()

	received := 0
	for received < frameCount {
		readCtx, readCancel := context.WithTimeout(context.Background(), 2*time.Second)
		_, data, err := clientConn.Read(readCtx)
		readCancel()
		if err != nil {
			t.Fatalf("reading frame %d: %v", received, err)
		}
		if int(data[0]) != received {
			t.Fatalf("want frame %d, got frame %d — a frame was dropped or reordered", received, data[0])
		}
		received++
	}

	if err := <-done; err != nil {
		t.Fatalf("enqueueBlocking: %v", err)
	}
}

// TestEnqueueDropsPastBufferCapacity documents the contrast: enqueue is
// deliberately built to drop when the buffer is full — correct for
// steady-state broadcast to a slow consumer, exactly why enqueueBlocking
// exists separately for the join-time replay instead of just replacing
// it.
func TestEnqueueDropsPastBufferCapacity(t *testing.T) {
	// No write pump running: nothing drains client.send, so it fills up.
	client := newClient("bob", "doc-1", nil)

	for i := 0; i < sendBuffer; i++ {
		if !client.enqueue(frame{binary: false, data: []byte{byte(i)}}) {
			t.Fatalf("enqueue %d: want success while under capacity", i)
		}
	}

	if client.enqueue(frame{binary: false, data: []byte("one too many")}) {
		t.Fatal("want enqueue to report failure once the buffer is full, not silently succeed")
	}
}
