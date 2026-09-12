package user

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Current Argon2id cost parameters for freshly hashed login keys. Stored
// per row (see argonParams.encode), so raising them later doesn't
// invalidate hashes written under the old cost — docs/ARCHITECTURE.md.
const (
	defaultMemoryKiB  = 64 * 1024
	defaultIterations = 3
	defaultThreads    = 1
	saltLength        = 16
	keyLength         = 32
)

// argonParams are the Argon2id cost parameters encoded per row, plus the
// salt.
type argonParams struct {
	memoryKiB  uint32
	iterations uint32
	threads    uint8
	saltB64    string
}

// HashLoginKey derives a new Argon2id hash for a login key, returning the
// hash and its encoded parameters — both are stored in their own columns.
func HashLoginKey(key LoginKey) (hash string, params string, err error) {
	salt := make([]byte, saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", "", fmt.Errorf("user: generating salt: %w", err)
	}

	p := argonParams{
		memoryKiB:  defaultMemoryKiB,
		iterations: defaultIterations,
		threads:    defaultThreads,
		saltB64:    base64.RawStdEncoding.EncodeToString(salt),
	}

	sum := argon2.IDKey([]byte(key), salt, p.iterations, p.memoryKiB, p.threads, keyLength)
	return base64.RawStdEncoding.EncodeToString(sum), p.encode(), nil
}

// VerifyLoginKey checks key against a previously stored hash+params pair,
// in constant time.
func VerifyLoginKey(key LoginKey, hash, params string) (bool, error) {
	p, err := decodeArgonParams(params)
	if err != nil {
		return false, err
	}

	salt, err := base64.RawStdEncoding.DecodeString(p.saltB64)
	if err != nil {
		return false, fmt.Errorf("user: decoding salt: %w", err)
	}

	want, err := base64.RawStdEncoding.DecodeString(hash)
	if err != nil {
		return false, fmt.Errorf("user: decoding stored hash: %w", err)
	}

	// keyLength, not len(want): we want Argon2 to produce exactly the
	// expected length, not whatever length a corrupted/tampered stored
	// hash happens to have (which uint32(len(want)) would silently
	// accept, plus risk a truncation overflow on an overly large blob).
	got := argon2.IDKey([]byte(key), salt, p.iterations, p.memoryKiB, p.threads, keyLength)
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

func (p argonParams) encode() string {
	return fmt.Sprintf("m=%d,t=%d,p=%d,salt=%s", p.memoryKiB, p.iterations, p.threads, p.saltB64)
}

func decodeArgonParams(s string) (argonParams, error) {
	var p argonParams

	for _, part := range strings.Split(s, ",") {
		key, value, ok := strings.Cut(part, "=")
		if !ok {
			continue
		}

		if key == "salt" {
			p.saltB64 = value
			continue
		}

		// bitSize matches each field's actual type — parsing "p"
		// (threads, a uint8) with bitSize 8 makes ParseUint itself
		// reject a value that doesn't fit, instead of a later
		// uint8(n) conversion silently truncating it.
		bitSize := 32
		if key == "p" {
			bitSize = 8
		}
		n, err := strconv.ParseUint(value, 10, bitSize)
		if err != nil {
			return argonParams{}, fmt.Errorf("user: malformed argon params %q: %w", s, err)
		}

		switch key {
		case "m":
			p.memoryKiB = uint32(n) // #nosec G115 -- n was parsed at bitSize 32, can't overflow
		case "t":
			p.iterations = uint32(n) // #nosec G115 -- n was parsed at bitSize 32, can't overflow
		case "p":
			p.threads = uint8(n) // #nosec G115 -- n was parsed at bitSize 8, can't overflow
		}
	}

	if p.saltB64 == "" || p.memoryKiB == 0 || p.iterations == 0 || p.threads == 0 {
		return argonParams{}, fmt.Errorf("user: malformed argon params: %q", s)
	}
	return p, nil
}
