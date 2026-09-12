package documentapp_test

import (
	"context"
	"errors"
	"testing"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/commands"
)

// TestKeyRotation is the acceptance test: removing a member needs to
// rotate the document's key, and the removed member's old wrapped DEK
// needs to become useless for anything from that point on — verified
// here as "the server simply never hands the removed member a wrapped
// DEK for the new epoch," the same thing a real client would observe as
// GetWrappedDEK returning 404 for them from then on.
func TestKeyRotation(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	staying := newTestUser(t, env)
	leaving := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if doc.CurrentKeyEpoch != 1 {
		t.Fatalf("want epoch 1 on creation, got %d", doc.CurrentKeyEpoch)
	}

	mustAdd := func(u testUser) {
		t.Helper()
		in := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: owner.ID, Email: u.Email, Role: document.RoleEditor, WrappedDEK: []byte("wrapped-epoch-1")}
		if err := env.documents.AddMemberByEmail(ctx, in); err != nil {
			t.Fatalf("adding %s: %v", u.Email, err)
		}
	}
	mustAdd(staying)
	mustAdd(leaving)

	t.Run("a non-owner cannot remove anyone", func(t *testing.T) {
		in := documentcommands.RemoveMemberInput{
			DocumentID: doc.ID,
			Caller:     staying.ID,
			TargetUser: leaving.ID,
			NewWraps:   map[user.ID][]byte{owner.ID: []byte("x"), staying.ID: []byte("y")},
		}
		if _, err := env.documents.RemoveMember(ctx, in); !errors.Is(err, document.ErrNotOwner) {
			t.Fatalf("want %v, got %v", document.ErrNotOwner, err)
		}
	})

	t.Run("the owner cannot remove themselves", func(t *testing.T) {
		in := documentcommands.RemoveMemberInput{
			DocumentID: doc.ID,
			Caller:     owner.ID,
			TargetUser: owner.ID,
			NewWraps:   map[user.ID][]byte{staying.ID: []byte("y"), leaving.ID: []byte("z")},
		}
		if _, err := env.documents.RemoveMember(ctx, in); !errors.Is(err, document.ErrCannotRemoveOwner) {
			t.Fatalf("want %v, got %v", document.ErrCannotRemoveOwner, err)
		}
	})

	t.Run("wraps that don't cover exactly the remaining members are rejected", func(t *testing.T) {
		in := documentcommands.RemoveMemberInput{
			DocumentID: doc.ID,
			Caller:     owner.ID,
			TargetUser: leaving.ID,
			NewWraps:   map[user.ID][]byte{owner.ID: []byte("x")}, // faltando "staying"
		}
		if _, err := env.documents.RemoveMember(ctx, in); !errors.Is(err, document.ErrIncompleteRotation) {
			t.Fatalf("want %v, got %v", document.ErrIncompleteRotation, err)
		}
	})

	var newEpoch int
	t.Run("the owner removes the departing member and rotates", func(t *testing.T) {
		in := documentcommands.RemoveMemberInput{
			DocumentID: doc.ID,
			Caller:     owner.ID,
			TargetUser: leaving.ID,
			NewWraps: map[user.ID][]byte{
				owner.ID:   []byte("wrapped-epoch-2-owner"),
				staying.ID: []byte("wrapped-epoch-2-staying"),
			},
		}
		epoch, err := env.documents.RemoveMember(ctx, in)
		if err != nil {
			t.Fatalf("removing member: %v", err)
		}
		if epoch != 2 {
			t.Fatalf("want epoch 2, got %d", epoch)
		}
		newEpoch = epoch
	})

	t.Run("the document itself now reports the new epoch", func(t *testing.T) {
		got, err := env.documents.Get(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if got.CurrentKeyEpoch != newEpoch {
			t.Fatalf("want %d, got %d", newEpoch, got.CurrentKeyEpoch)
		}
	})

	t.Run("the removed member is no longer a member at all", func(t *testing.T) {
		isMember, err := env.documents.IsMember(ctx, doc.ID, leaving.ID)
		if err != nil {
			t.Fatalf("IsMember: %v", err)
		}
		if isMember {
			t.Fatal("removed member should no longer be a member")
		}
		if _, err := env.documents.GetWrappedDEK(ctx, doc.ID, leaving.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("removed member fetching wrapped DEK: want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("the staying member gets the new epoch's wrap", func(t *testing.T) {
		view, err := env.documents.GetWrappedDEK(ctx, doc.ID, staying.ID)
		if err != nil {
			t.Fatalf("staying member fetching wrapped DEK: %v", err)
		}
		if view.KeyEpoch != newEpoch {
			t.Fatalf("want epoch %d, got %d", newEpoch, view.KeyEpoch)
		}
		if string(view.WrappedDEK) != "wrapped-epoch-2-staying" {
			t.Fatalf("got the wrong wrapped DEK: %q", view.WrappedDEK)
		}
	})

	t.Run("the staying member's old epoch-1 wrap is archived, not lost", func(t *testing.T) {
		history, err := env.documents.GetKeyHistory(ctx, doc.ID, staying.ID)
		if err != nil {
			t.Fatalf("getting key history: %v", err)
		}
		if len(history) != 1 {
			t.Fatalf("want exactly one archived epoch, got %d", len(history))
		}
		if history[0].KeyEpoch != 1 {
			t.Fatalf("want archived epoch 1, got %d", history[0].KeyEpoch)
		}
		if string(history[0].WrappedDEK) != "wrapped-epoch-1" {
			t.Fatalf("got the wrong archived wrapped DEK: %q", history[0].WrappedDEK)
		}
	})

	t.Run("a stranger cannot read anyone's key history", func(t *testing.T) {
		stranger := newTestUser(t, env)
		if _, err := env.documents.GetKeyHistory(ctx, doc.ID, stranger.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("a member invited after the rotation gets stamped with the new epoch, not the default", func(t *testing.T) {
		lateJoiner := newTestUser(t, env)
		in := documentcommands.AddMemberInput{
			DocumentID: doc.ID,
			Caller:     owner.ID,
			Email:      lateJoiner.Email,
			Role:       document.RoleEditor,
			WrappedDEK: []byte("wrapped-epoch-2-late-joiner"),
		}
		if err := env.documents.AddMemberByEmail(ctx, in); err != nil {
			t.Fatalf("inviting late joiner: %v", err)
		}
		view, err := env.documents.GetWrappedDEK(ctx, doc.ID, lateJoiner.ID)
		if err != nil {
			t.Fatalf("late joiner fetching wrapped DEK: %v", err)
		}
		if view.KeyEpoch != newEpoch {
			t.Fatalf("want epoch %d, got %d", newEpoch, view.KeyEpoch)
		}
	})
}
