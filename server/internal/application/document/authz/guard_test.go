package authz_test

import (
	"context"
	"errors"
	"testing"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
)

// fakeMembership is a hand-written MembershipRepository test double —
// only IsMember is exercised by RequireMembership, so the rest of the
// interface panics if called, catching an accidental extra dependency.
type fakeMembership struct {
	document.MembershipRepository
	isMember bool
	err      error
}

func (f fakeMembership) IsMember(ctx context.Context, docID document.ID, userID user.ID) (bool, error) {
	return f.isMember, f.err
}

func TestRequireMembership(t *testing.T) {
	ctx := context.Background()
	docID := document.ID("doc-1")
	callerID := user.ID("user-1")

	t.Run("member passes", func(t *testing.T) {
		membership := fakeMembership{isMember: true}
		if err := authz.RequireMembership(ctx, membership, docID, callerID); err != nil {
			t.Fatalf("want nil, got %v", err)
		}
	})

	t.Run("non-member is not found", func(t *testing.T) {
		membership := fakeMembership{isMember: false}
		err := authz.RequireMembership(ctx, membership, docID, callerID)
		if !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("repository error is wrapped, not swallowed", func(t *testing.T) {
		repoErr := errors.New("connection reset")
		membership := fakeMembership{err: repoErr}
		err := authz.RequireMembership(ctx, membership, docID, callerID)
		if !errors.Is(err, repoErr) {
			t.Fatalf("want wrapped %v, got %v", repoErr, err)
		}
		if errors.Is(err, document.ErrNotFound) {
			t.Fatal("repository error must not be mistaken for ErrNotFound")
		}
	})
}
