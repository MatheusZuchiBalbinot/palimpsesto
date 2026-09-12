package documentapp_test

import (
	"context"
	"errors"
	"testing"

	"palimpsesto/internal/domain/document"

	"palimpsesto/internal/application/document/commands"
)

// TestUpdateMemberRole is the acceptance test: the owner can promote or
// demote a member between editor and reader without any key rotation —
// role is pure authorization, never something the DEK's encryption
// depends on.
func TestUpdateMemberRole(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	member := newTestUser(t, env)
	stranger := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	addMember := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: owner.ID, Email: member.Email, Role: document.RoleReader}
	if err := env.documents.AddMemberByEmail(ctx, addMember); err != nil {
		t.Fatalf("inviting member: %v", err)
	}

	t.Run("a non-owner cannot change anyone's role", func(t *testing.T) {
		in := documentcommands.UpdateMemberRoleInput{DocumentID: doc.ID, Caller: member.ID, TargetUser: member.ID, Role: document.RoleEditor}
		if err := env.documents.UpdateMemberRole(ctx, in); !errors.Is(err, document.ErrNotOwner) {
			t.Fatalf("want %v, got %v", document.ErrNotOwner, err)
		}
	})

	t.Run("the owner cannot change their own role", func(t *testing.T) {
		in := documentcommands.UpdateMemberRoleInput{DocumentID: doc.ID, Caller: owner.ID, TargetUser: owner.ID, Role: document.RoleEditor}
		if err := env.documents.UpdateMemberRole(ctx, in); !errors.Is(err, document.ErrCannotChangeOwnRole) {
			t.Fatalf("want %v, got %v", document.ErrCannotChangeOwnRole, err)
		}
	})

	t.Run("an invalid role is rejected", func(t *testing.T) {
		in := documentcommands.UpdateMemberRoleInput{DocumentID: doc.ID, Caller: owner.ID, TargetUser: member.ID, Role: document.RoleOwner}
		if err := env.documents.UpdateMemberRole(ctx, in); !errors.Is(err, document.ErrInvalidRole) {
			t.Fatalf("want %v, got %v", document.ErrInvalidRole, err)
		}
	})

	t.Run("the owner promotes the member to editor", func(t *testing.T) {
		in := documentcommands.UpdateMemberRoleInput{DocumentID: doc.ID, Caller: owner.ID, TargetUser: member.ID, Role: document.RoleEditor}
		if err := env.documents.UpdateMemberRole(ctx, in); err != nil {
			t.Fatalf("promoting member: %v", err)
		}

		if _, err := env.documents.AppendUpdate(ctx, doc.ID, member.ID, []byte("now an editor")); err != nil {
			t.Fatalf("promoted member should be able to write: %v", err)
		}
	})

	t.Run("changing a stranger's role fails with not found", func(t *testing.T) {
		in := documentcommands.UpdateMemberRoleInput{DocumentID: doc.ID, Caller: owner.ID, TargetUser: stranger.ID, Role: document.RoleEditor}
		if err := env.documents.UpdateMemberRole(ctx, in); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})
}

// TestLeaveDocument is the acceptance test: any non-owner member can
// remove their own membership without needing the owner's involvement,
// and — unlike RemoveMember — without rotating the document's key, since
// a member choosing to leave already had the DEK and giving up access
// voluntarily doesn't need to be revoked from them.
func TestLeaveDocument(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	member := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	epochBeforeLeaving := doc.CurrentKeyEpoch

	addMember := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: owner.ID, Email: member.Email, Role: document.RoleEditor}
	if err := env.documents.AddMemberByEmail(ctx, addMember); err != nil {
		t.Fatalf("inviting member: %v", err)
	}

	t.Run("the owner cannot leave their own document", func(t *testing.T) {
		in := documentcommands.LeaveDocumentInput{DocumentID: doc.ID, Caller: owner.ID}
		if err := env.documents.LeaveDocument(ctx, in); !errors.Is(err, document.ErrCannotRemoveOwner) {
			t.Fatalf("want %v, got %v", document.ErrCannotRemoveOwner, err)
		}
	})

	t.Run("the member leaves without needing the owner, and the key isn't rotated", func(t *testing.T) {
		in := documentcommands.LeaveDocumentInput{DocumentID: doc.ID, Caller: member.ID}
		if err := env.documents.LeaveDocument(ctx, in); err != nil {
			t.Fatalf("leaving: %v", err)
		}

		if _, err := env.documents.GetWrappedDEK(ctx, doc.ID, member.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("former member should no longer be a member: want %v, got %v", document.ErrNotFound, err)
		}

		reloaded, err := env.documents.Get(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("reloading document: %v", err)
		}
		if reloaded.CurrentKeyEpoch != epochBeforeLeaving {
			t.Fatalf("leaving should not rotate the key: want epoch %d, got %d", epochBeforeLeaving, reloaded.CurrentKeyEpoch)
		}
	})

	t.Run("leaving twice fails with not found", func(t *testing.T) {
		in := documentcommands.LeaveDocumentInput{DocumentID: doc.ID, Caller: member.ID}
		if err := env.documents.LeaveDocument(ctx, in); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})
}
