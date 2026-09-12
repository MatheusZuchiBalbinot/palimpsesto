package documentapp_test

import (
	"context"
	"errors"
	"testing"

	"palimpsesto/internal/domain/document"

	"palimpsesto/internal/application/document/commands"
)

// TestReaderCannotWrite is the acceptance test for role enforcement: a
// reader can see a document but not change it — neither its content
// (updates) nor its title. An editor, on the other hand, can do both.
func TestReaderCannotWrite(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	reader := newTestUser(t, env)
	editor := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	addReader := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: owner.ID, Email: reader.Email, Role: document.RoleReader}
	if err := env.documents.AddMemberByEmail(ctx, addReader); err != nil {
		t.Fatalf("inviting reader: %v", err)
	}
	addEditor := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: owner.ID, Email: editor.Email, Role: document.RoleEditor}
	if err := env.documents.AddMemberByEmail(ctx, addEditor); err != nil {
		t.Fatalf("inviting editor: %v", err)
	}

	t.Run("reader cannot append updates", func(t *testing.T) {
		_, err := env.documents.AppendUpdate(ctx, doc.ID, reader.ID, []byte("opaque ciphertext"))
		if !errors.Is(err, document.ErrNotEditor) {
			t.Fatalf("want %v, got %v", document.ErrNotEditor, err)
		}
	})

	t.Run("reader cannot rename", func(t *testing.T) {
		err := env.documents.UpdateTitle(ctx, doc.ID, reader.ID, "sneaky rename")
		if !errors.Is(err, document.ErrNotEditor) {
			t.Fatalf("want %v, got %v", document.ErrNotEditor, err)
		}
	})

	t.Run("reader can still read", func(t *testing.T) {
		if _, err := env.documents.Get(ctx, doc.ID, reader.ID); err != nil {
			t.Fatalf("reader should be able to read: %v", err)
		}
	})

	t.Run("editor can append updates and rename", func(t *testing.T) {
		if _, err := env.documents.AppendUpdate(ctx, doc.ID, editor.ID, []byte("opaque ciphertext")); err != nil {
			t.Fatalf("editor appending update: %v", err)
		}
		if err := env.documents.UpdateTitle(ctx, doc.ID, editor.ID, "renamed by editor"); err != nil {
			t.Fatalf("editor renaming: %v", err)
		}
	})

	t.Run("a stranger cannot append updates either, but with ErrNotFound not ErrNotEditor", func(t *testing.T) {
		stranger := newTestUser(t, env)
		_, err := env.documents.AppendUpdate(ctx, doc.ID, stranger.ID, []byte("opaque ciphertext"))
		if !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("a reader cannot grant owner to anyone, including themselves, via AddMember", func(t *testing.T) {
		target := newTestUser(t, env)
		addOwner := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: reader.ID, Email: target.Email, Role: document.RoleOwner}
		if err := env.documents.AddMemberByEmail(ctx, addOwner); !errors.Is(err, document.ErrInvalidRole) {
			t.Fatalf("want %v, got %v", document.ErrInvalidRole, err)
		}

		isMember, err := env.documents.IsMember(ctx, doc.ID, target.ID)
		if err != nil {
			t.Fatalf("checking membership: %v", err)
		}
		if isMember {
			t.Fatal("target must not have been added as a member when the role grant was rejected")
		}
	})
}

// TestAddMemberRejectsOwnerRole is the acceptance test for the
// AddMember privilege-escalation fix: AddMember must reject
// document.RoleOwner exactly like CreateInvite already does, so no
// member — regardless of their own role — can mint a second owner for a
// document they don't own.
func TestAddMemberRejectsOwnerRole(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	target := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	addOwner := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: owner.ID, Email: target.Email, Role: document.RoleOwner}
	if err := env.documents.AddMemberByEmail(ctx, addOwner); !errors.Is(err, document.ErrInvalidRole) {
		t.Fatalf("want %v, got %v", document.ErrInvalidRole, err)
	}
}

// TestCreateInviteLinkRejectsOwnerRole guards the same class of bug on
// the sharing-link path: a link must never be mintable with
// document.RoleOwner, matching InviteLink's own "Never grants RoleOwner"
// invariant.
func TestCreateInviteLinkRejectsOwnerRole(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	doc, err := env.documents.Create(ctx, owner.ID, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	in := documentcommands.CreateInviteLinkInput{DocumentID: doc.ID, Caller: owner.ID, Role: document.RoleOwner}
	if _, err := env.documents.CreateInviteLink(ctx, in); !errors.Is(err, document.ErrInvalidRole) {
		t.Fatalf("want %v, got %v", document.ErrInvalidRole, err)
	}
}

// TestSetMemberWrappedDEKCannotOverwriteAnotherMembersWrap guards
// against a reader clobbering another member's already-set wrapped DEK
// — the operation is meant only for completing a pending wrap (a member
// who joined via invite link and has none yet), not for overwriting one
// that's already there.
func TestSetMemberWrappedDEKCannotOverwriteAnotherMembersWrap(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	reader := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := env.documents.SetMemberWrappedDEK(ctx, documentcommands.SetMemberWrappedDEKInput{
		DocumentID: doc.ID, Caller: owner.ID, TargetUser: owner.ID, WrappedDEK: []byte("owner-dek"),
	}); err != nil {
		t.Fatalf("owner self-wrap: %v", err)
	}

	addReader := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: owner.ID, Email: reader.Email, Role: document.RoleReader, WrappedDEK: []byte("reader-dek")}
	if err := env.documents.AddMemberByEmail(ctx, addReader); err != nil {
		t.Fatalf("inviting reader: %v", err)
	}

	t.Run("a member cannot overwrite an owner's already-set wrapped DEK", func(t *testing.T) {
		attempt := documentcommands.SetMemberWrappedDEKInput{
			DocumentID: doc.ID, Caller: reader.ID, TargetUser: owner.ID, WrappedDEK: []byte("malicious-dek"),
		}
		if err := env.documents.SetMemberWrappedDEK(ctx, attempt); !errors.Is(err, document.ErrWrappedDEKAlreadySet) {
			t.Fatalf("want %v, got %v", document.ErrWrappedDEKAlreadySet, err)
		}

		view, err := env.documents.GetWrappedDEK(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("owner fetching own wrapped DEK: %v", err)
		}
		if string(view.WrappedDEK) != "owner-dek" {
			t.Fatalf("owner's wrapped DEK must be unchanged, got %q", view.WrappedDEK)
		}
	})

	t.Run("a member can still complete another member's pending wrap", func(t *testing.T) {
		linkOnly := newTestUser(t, env)
		if err := env.documents.AddMemberByEmail(ctx, documentcommands.AddMemberInput{
			DocumentID: doc.ID, Caller: owner.ID, Email: linkOnly.Email, Role: document.RoleReader,
		}); err != nil {
			t.Fatalf("adding pending member: %v", err)
		}

		complete := documentcommands.SetMemberWrappedDEKInput{
			DocumentID: doc.ID, Caller: reader.ID, TargetUser: linkOnly.ID, WrappedDEK: []byte("pending-dek"),
		}
		if err := env.documents.SetMemberWrappedDEK(ctx, complete); err != nil {
			t.Fatalf("completing pending wrap: %v", err)
		}
	})
}
