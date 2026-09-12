package realtime

import "testing"

func TestParseUUID(t *testing.T) {
	t.Run("valid canonical UUID round-trips to 16 bytes", func(t *testing.T) {
		got, err := ParseUUID("0194f7f0-1234-7abc-9def-0123456789ab")
		if err != nil {
			t.Fatalf("ParseUUID: %v", err)
		}
		want := [16]byte{0x01, 0x94, 0xf7, 0xf0, 0x12, 0x34, 0x7a, 0xbc, 0x9d, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab}
		if got != want {
			t.Fatalf("want %x, got %x", want, got)
		}
	})

	t.Run("wrong length is rejected", func(t *testing.T) {
		if _, err := ParseUUID("not-a-uuid"); err == nil {
			t.Fatal("want an error for a string that isn't UUID-shaped")
		}
	})

	t.Run("right length but non-hex characters is rejected", func(t *testing.T) {
		if _, err := ParseUUID("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"); err == nil {
			t.Fatal("want an error for non-hex characters even at the right length")
		}
	})
}
