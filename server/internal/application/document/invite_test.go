package documentapp_test

import (
	"context"
	"errors"
	"testing"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/commands"
)

// TestInvites is the acceptance test: creating, listing, accepting, and
// declining a pending invite, plus the cases that must fail (a stranger
// probing someone else's invite, a rotated key making an old invite
// stale).
func TestInvites(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	invitee := newTestUser(t, env)
	stranger := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "invite-only doc")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	t.Run("a non-member cannot invite", func(t *testing.T) {
		in := documentcommands.CreateInviteInput{DocumentID: doc.ID, Caller: stranger.ID, Email: invitee.Email, Role: document.RoleEditor, WrappedDEK: []byte("x")}
		if _, err := env.documents.CreateInvite(ctx, in); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("inviting a nonexistent email fails", func(t *testing.T) {
		in := documentcommands.CreateInviteInput{DocumentID: doc.ID, Caller: owner.ID, Email: "nobody@example.com", Role: document.RoleEditor, WrappedDEK: []byte("x")}
		if _, err := env.documents.CreateInvite(ctx, in); !errors.Is(err, document.ErrUserNotFound) {
			t.Fatalf("want %v, got %v", document.ErrUserNotFound, err)
		}
	})

	createInviteInput := documentcommands.CreateInviteInput{
		DocumentID: doc.ID,
		Caller:     owner.ID,
		Email:      invitee.Email,
		Role:       document.RoleEditor,
		WrappedDEK: []byte("sealed-for-invitee"),
	}
	invite, err := env.documents.CreateInvite(ctx, createInviteInput)
	if err != nil {
		t.Fatalf("creating invite: %v", err)
	}

	t.Run("inviting the same person again while pending is rejected", func(t *testing.T) {
		if _, err := env.documents.CreateInvite(ctx, createInviteInput); !errors.Is(err, document.ErrAlreadyInvited) {
			t.Fatalf("want %v, got %v", document.ErrAlreadyInvited, err)
		}
	})

	t.Run("the invitee is not yet a member", func(t *testing.T) {
		if _, err := env.documents.Get(ctx, doc.ID, invitee.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("it shows up in the invitee's pending list, not the stranger's", func(t *testing.T) {
		pending, err := env.documents.ListInvites(ctx, invitee.ID)
		if err != nil {
			t.Fatalf("listing invitee's invites: %v", err)
		}
		if len(pending) != 1 || pending[0].ID != invite.ID {
			t.Fatalf("want [%v], got %+v", invite.ID, pending)
		}

		strangerPending, err := env.documents.ListInvites(ctx, stranger.ID)
		if err != nil {
			t.Fatalf("listing stranger's invites: %v", err)
		}
		if len(strangerPending) != 0 {
			t.Fatalf("want empty, got %+v", strangerPending)
		}
	})

	t.Run("a stranger cannot accept or decline someone else's invite", func(t *testing.T) {
		if _, err := env.documents.AcceptInvite(ctx, invite.ID, stranger.ID); !errors.Is(err, document.ErrInviteNotFound) {
			t.Fatalf("accept: want %v, got %v", document.ErrInviteNotFound, err)
		}
		if _, err := env.documents.DeclineInvite(ctx, invite.ID, stranger.ID); !errors.Is(err, document.ErrInviteNotFound) {
			t.Fatalf("decline: want %v, got %v", document.ErrInviteNotFound, err)
		}
	})

	t.Run("the invitee accepts, and gains real access with the pre-sealed key", func(t *testing.T) {
		if _, err := env.documents.AcceptInvite(ctx, invite.ID, invitee.ID); err != nil {
			t.Fatalf("accepting: %v", err)
		}

		got, err := env.documents.Get(ctx, doc.ID, invitee.ID)
		if err != nil {
			t.Fatalf("invitee Get after accept: %v", err)
		}
		if got.ID != doc.ID {
			t.Fatalf("want %v, got %v", doc.ID, got.ID)
		}

		members, err := env.documents.ListMembers(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("listing members: %v", err)
		}
		found := false
		for _, m := range members {
			if m.UserID == invitee.ID {
				found = true
				if !m.HasWrappedDEK {
					t.Fatalf("want the invite's pre-sealed key to already be in place, got HasWrappedDEK=false")
				}
			}
		}
		if !found {
			t.Fatalf("invitee not found among members: %+v", members)
		}
	})

	t.Run("accepting again fails — the invite is gone", func(t *testing.T) {
		if _, err := env.documents.AcceptInvite(ctx, invite.ID, invitee.ID); !errors.Is(err, document.ErrInviteNotFound) {
			t.Fatalf("want %v, got %v", document.ErrInviteNotFound, err)
		}
	})

	t.Run("declining removes the invite instead of accepting it", func(t *testing.T) {
		declineTarget := newTestUser(t, env)
		in := documentcommands.CreateInviteInput{DocumentID: doc.ID, Caller: owner.ID, Email: declineTarget.Email, Role: document.RoleReader, WrappedDEK: []byte("x")}
		declineInvite, err := env.documents.CreateInvite(ctx, in)
		if err != nil {
			t.Fatalf("creating invite: %v", err)
		}

		if _, err := env.documents.DeclineInvite(ctx, declineInvite.ID, declineTarget.ID); err != nil {
			t.Fatalf("declining: %v", err)
		}
		if _, err := env.documents.Get(ctx, doc.ID, declineTarget.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("declined invitee should not have gained access: want %v, got %v", document.ErrNotFound, err)
		}

		pending, err := env.documents.ListInvites(ctx, declineTarget.ID)
		if err != nil {
			t.Fatalf("listing: %v", err)
		}
		if len(pending) != 0 {
			t.Fatalf("want empty after decline, got %+v", pending)
		}
	})

	t.Run("a stale invite (key rotated while pending) is rejected on accept", func(t *testing.T) {
		staleTarget := newTestUser(t, env)
		in := documentcommands.CreateInviteInput{DocumentID: doc.ID, Caller: owner.ID, Email: staleTarget.Email, Role: document.RoleEditor, WrappedDEK: []byte("x")}
		staleInvite, err := env.documents.CreateInvite(ctx, in)
		if err != nil {
			t.Fatalf("creating invite: %v", err)
		}

		// Rotates the key by removing the already-accepted invitee — any
		// remaining member's wrap is fine here, the rotation itself is
		// the point, not who ends up holding the new epoch.
		removeInput := documentcommands.RemoveMemberInput{
			DocumentID: doc.ID,
			Caller:     owner.ID,
			TargetUser: invitee.ID,
			NewWraps:   map[user.ID][]byte{owner.ID: []byte("rotated-for-owner")},
		}
		if _, err := env.documents.RemoveMember(ctx, removeInput); err != nil {
			t.Fatalf("rotating key: %v", err)
		}

		if _, err := env.documents.AcceptInvite(ctx, staleInvite.ID, staleTarget.ID); !errors.Is(err, document.ErrInviteStale) {
			t.Fatalf("want %v, got %v", document.ErrInviteStale, err)
		}
	})
}
