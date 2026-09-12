package user_test

import (
	"strings"
	"testing"

	"palimpsesto/internal/domain/user"
)

func fixedKeys(identityFill, signingFill byte) user.PublicKeys {
	identity := make([]byte, 32)
	signing := make([]byte, 32)
	for i := range identity {
		identity[i] = identityFill
	}
	for i := range signing {
		signing[i] = signingFill
	}
	return user.PublicKeys{IdentityPub: identity, SigningPub: signing}
}

func TestPublicKeysValidate(t *testing.T) {
	t.Run("accepts correctly sized keys", func(t *testing.T) {
		if err := fixedKeys(1, 2).Validate(); err != nil {
			t.Fatalf("want no error, got %v", err)
		}
	})

	t.Run("rejects a short identity_pub", func(t *testing.T) {
		keys := fixedKeys(1, 2)
		keys.IdentityPub = keys.IdentityPub[:16]
		if err := keys.Validate(); err == nil {
			t.Fatal("want an error for a short identity_pub, got nil")
		}
	})

	t.Run("rejects a short signing_pub", func(t *testing.T) {
		keys := fixedKeys(1, 2)
		keys.SigningPub = keys.SigningPub[:16]
		if err := keys.Validate(); err == nil {
			t.Fatal("want an error for a short signing_pub, got nil")
		}
	})
}

// TestComputeFingerprint checks the acceptance criterion: the same keypair
// always produces the same fingerprint, and a single differing bit
// produces a visibly different one.
func TestComputeFingerprint(t *testing.T) {
	keys := fixedKeys(1, 2)

	t.Run("deterministic", func(t *testing.T) {
		a := user.ComputeFingerprint(keys)
		b := user.ComputeFingerprint(keys)
		if a != b {
			t.Fatalf("want the same fingerprint twice, got %q and %q", a, b)
		}
	})

	t.Run("a different key produces a different fingerprint", func(t *testing.T) {
		other := fixedKeys(1, 3)
		a := user.ComputeFingerprint(keys)
		b := user.ComputeFingerprint(other)
		if a == b {
			t.Fatalf("want different fingerprints for different keys, both were %q", a)
		}
	})

	t.Run("formatted as 12 groups of 5 digits", func(t *testing.T) {
		fp := string(user.ComputeFingerprint(keys))
		groups := strings.Split(fp, " ")
		if len(groups) != 12 {
			t.Fatalf("want 12 groups, got %d (%q)", len(groups), fp)
		}
		for _, g := range groups {
			if len(g) != 5 {
				t.Fatalf("want each group to be 5 digits, got %q in %q", g, fp)
			}
			for _, c := range g {
				if c < '0' || c > '9' {
					t.Fatalf("want only digits, got %q in group %q", c, g)
				}
			}
		}
	})
}
