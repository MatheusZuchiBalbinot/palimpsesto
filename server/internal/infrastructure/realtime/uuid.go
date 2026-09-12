package realtime

import (
	"encoding/hex"
	"fmt"
	"strings"
)

// ParseUUID turns a canonical UUID string
// "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" (what Postgres and our JWT
// claims use) into the 16 raw bytes that the wire protocol in
// docs/API.md puts in the author_id field.
func ParseUUID(s string) ([16]byte, error) {
	var out [16]byte

	hexOnly := strings.ReplaceAll(s, "-", "")
	if len(hexOnly) != 32 {
		return out, fmt.Errorf("realtime: %q is not a UUID", s)
	}

	decoded, err := hex.DecodeString(hexOnly)
	if err != nil {
		return out, fmt.Errorf("realtime: decoding UUID %q: %w", s, err)
	}

	copy(out[:], decoded)
	return out, nil
}
