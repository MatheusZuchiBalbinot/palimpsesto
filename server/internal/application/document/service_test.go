package documentapp_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"palimpsesto/internal/config"
	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
	"palimpsesto/internal/infrastructure/persistence/postgres"

	"palimpsesto/internal/application/document"
	"palimpsesto/internal/application/document/commands"
	"palimpsesto/internal/application/document/dto"
	"palimpsesto/internal/application/user"
	"palimpsesto/internal/application/user/commands"
)

// testEnv connects a document application service and a user one
// against the real database configured for the running environment
// (docker-compose's db service).
type testEnv struct {
	documents *documentapp.Service
	users     *userapp.Service
}

func newTestEnv(t *testing.T) testEnv {
	t.Helper()

	dsn, ok := os.LookupEnv("PALIMPSESTO_DATABASE_URL")
	if !ok {
		t.Skip("PALIMPSESTO_DATABASE_URL not set; skipping integration test")
	}

	pool, err := postgres.NewPool(context.Background(), config.DatabaseURL(dsn))
	if err != nil {
		t.Fatalf("connecting to test database: %v", err)
	}
	t.Cleanup(pool.Close)

	userRepo := postgres.NewUserRepository(pool)
	userKeysRepo := postgres.NewUserKeysRepository(pool)
	sessionRepo := postgres.NewSessionRepository(pool)
	documentRepo := postgres.NewDocumentRepository(pool)

	return testEnv{
		documents: documentapp.NewService(documentRepo, documentRepo, documentRepo, documentRepo, documentRepo, documentRepo, documentRepo, documentRepo),
		users:     userapp.NewService(userRepo, sessionRepo, userKeysRepo, []byte("test-secret")),
	}
}

// testUser is a registered user, with the email kept close at hand for
// tests that need to invite them by email (the document service has no
// lookup by user ID — membership is always granted by email, same as
// the real invite flow).
type testUser struct {
	ID    user.ID
	Email string
}

func newTestUser(t *testing.T, env testEnv) testUser {
	t.Helper()

	email := user.Email(fmt.Sprintf("test-%d@example.com", time.Now().UnixNano()))
	ctx := context.Background()
	registerInput := usercommands.RegisterInput{Email: email, LoginKey: "correct-horse-battery", SaltMK: []byte("0123456789abcdef")}
	if err := env.users.Register(ctx, registerInput); err != nil {
		t.Fatalf("registering test user: %v", err)
	}

	loginInput := usercommands.LoginInput{Email: email, LoginKey: "correct-horse-battery", DeviceLabel: "test"}
	tokens, err := env.users.Login(ctx, loginInput)
	if err != nil {
		t.Fatalf("logging in test user: %v", err)
	}
	return testUser{ID: tokens.Account.ID, Email: string(email)}
}

// TestAuthorization is the acceptance test: a user who isn't a member
// of a document can't manage to read or write it — checked before any
// handler-level logic runs.
func TestAuthorization(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	stranger := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "owner's private doc")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	t.Run("stranger cannot read", func(t *testing.T) {
		_, err := env.documents.Get(ctx, doc.ID, stranger.ID)
		if !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("stranger cannot list members", func(t *testing.T) {
		_, err := env.documents.ListMembers(ctx, doc.ID, stranger.ID)
		if !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("stranger cannot delete", func(t *testing.T) {
		err := env.documents.Delete(ctx, doc.ID, stranger.ID)
		if !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("stranger cannot append updates", func(t *testing.T) {
		isMember, err := env.documents.IsMember(ctx, doc.ID, stranger.ID)
		if err != nil {
			t.Fatalf("IsMember: %v", err)
		}
		if isMember {
			t.Fatal("stranger should not be a member")
		}
	})

	t.Run("owner can read their own document", func(t *testing.T) {
		got, err := env.documents.Get(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("owner get: %v", err)
		}
		if got.ID != doc.ID {
			t.Fatalf("want %v, got %v", doc.ID, got.ID)
		}
	})
}

func TestMembershipAndOwnership(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	member := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "shared doc")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	addMemberInput := documentcommands.AddMemberInput{
		DocumentID: doc.ID,
		Caller:     owner.ID,
		Email:      member.Email,
		Role:       document.RoleEditor,
	}
	if err := env.documents.AddMemberByEmail(ctx, addMemberInput); err != nil {
		t.Fatalf("inviting member: %v", err)
	}

	if _, err := env.documents.Get(ctx, doc.ID, member.ID); err != nil {
		t.Fatalf("member should be able to read: %v", err)
	}

	if err := env.documents.Delete(ctx, doc.ID, member.ID); !errors.Is(err, document.ErrNotOwner) {
		t.Fatalf("non-owner member deleting: want %v, got %v", document.ErrNotOwner, err)
	}

	if err := env.documents.Delete(ctx, doc.ID, owner.ID); err != nil {
		t.Fatalf("owner deleting: %v", err)
	}
}

// TestDeleteAndRestore covers the "undo delete" flow: a deleted document
// becomes fully inaccessible (to the owner too, not just other members)
// until restored, only the owner can restore it, and restoring
// something that isn't currently deleted is rejected instead of
// silently doing nothing.
func TestDeleteAndRestore(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	member := newTestUser(t, env)
	stranger := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "undoable doc")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	addMemberInput := documentcommands.AddMemberInput{
		DocumentID: doc.ID,
		Caller:     owner.ID,
		Email:      member.Email,
		Role:       document.RoleEditor,
	}
	if err := env.documents.AddMemberByEmail(ctx, addMemberInput); err != nil {
		t.Fatalf("inviting member: %v", err)
	}

	if err := env.documents.Delete(ctx, doc.ID, owner.ID); err != nil {
		t.Fatalf("owner deleting: %v", err)
	}

	t.Run("deleted document is invisible to owner and member alike", func(t *testing.T) {
		if _, err := env.documents.Get(ctx, doc.ID, owner.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("owner Get after delete: want %v, got %v", document.ErrNotFound, err)
		}
		if _, err := env.documents.Get(ctx, doc.ID, member.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("member Get after delete: want %v, got %v", document.ErrNotFound, err)
		}
		if isMember, err := env.documents.IsMember(ctx, doc.ID, owner.ID); err != nil || isMember {
			t.Fatalf("owner IsMember after delete: want false, got %v (err %v)", isMember, err)
		}
	})

	t.Run("the deleted document shows up in the owner's archived list, not the member's", func(t *testing.T) {
		ownerArchived, err := env.documents.ListArchived(ctx, owner.ID)
		if err != nil {
			t.Fatalf("listing owner's archived docs: %v", err)
		}
		if len(ownerArchived) != 1 || ownerArchived[0].ID != doc.ID {
			t.Fatalf("want [%v], got %+v", doc.ID, ownerArchived)
		}

		memberArchived, err := env.documents.ListArchived(ctx, member.ID)
		if err != nil {
			t.Fatalf("listing member's archived docs: %v", err)
		}
		if len(memberArchived) != 0 {
			t.Fatalf("want empty (member never owned it), got %+v", memberArchived)
		}
	})

	t.Run("a non-owner cannot restore", func(t *testing.T) {
		if err := env.documents.Restore(ctx, doc.ID, member.ID); !errors.Is(err, document.ErrNotOwner) {
			t.Fatalf("member restoring: want %v, got %v", document.ErrNotOwner, err)
		}
		if err := env.documents.Restore(ctx, doc.ID, stranger.ID); !errors.Is(err, document.ErrNotOwner) {
			t.Fatalf("stranger restoring: want %v, got %v", document.ErrNotOwner, err)
		}
	})

	t.Run("restoring something that doesn't exist at all", func(t *testing.T) {
		if err := env.documents.Restore(ctx, document.ID("00000000-0000-0000-0000-000000000000"), owner.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("restoring nonexistent doc: want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("the owner restores it and access comes back", func(t *testing.T) {
		if err := env.documents.Restore(ctx, doc.ID, owner.ID); err != nil {
			t.Fatalf("owner restoring: %v", err)
		}
		if _, err := env.documents.Get(ctx, doc.ID, owner.ID); err != nil {
			t.Fatalf("owner Get after restore: %v", err)
		}
		if _, err := env.documents.Get(ctx, doc.ID, member.ID); err != nil {
			t.Fatalf("member Get after restore: %v", err)
		}
	})

	t.Run("restoring a document that isn't deleted is rejected, not a no-op", func(t *testing.T) {
		if err := env.documents.Restore(ctx, doc.ID, owner.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("restoring an active document: want %v, got %v", document.ErrNotFound, err)
		}
	})
}

// TestInviteLinkShareFlow covers the self-service join flow: an owner
// generates a share link, a stranger joins by presenting only its
// token (no prior email invite), and revoking or rotating the link
// invalidates any token that was previously in circulation.
func TestInviteLinkShareFlow(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	stranger := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "shared via link")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	t.Run("stranger cannot create a link, and existence stays hidden", func(t *testing.T) {
		in := documentcommands.CreateInviteLinkInput{DocumentID: doc.ID, Caller: stranger.ID, Role: document.RoleEditor}
		if _, err := env.documents.CreateInviteLink(ctx, in); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("member who isn't owner cannot create a link", func(t *testing.T) {
		member := newTestUser(t, env)
		addInput := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: owner.ID, Email: member.Email, Role: document.RoleEditor}
		if err := env.documents.AddMemberByEmail(ctx, addInput); err != nil {
			t.Fatalf("adding member: %v", err)
		}

		in := documentcommands.CreateInviteLinkInput{DocumentID: doc.ID, Caller: member.ID, Role: document.RoleEditor}
		if _, err := env.documents.CreateInviteLink(ctx, in); !errors.Is(err, document.ErrNotOwner) {
			t.Fatalf("want %v, got %v", document.ErrNotOwner, err)
		}
	})

	t.Run("owner creates a link and a stranger joins with its role", func(t *testing.T) {
		in := documentcommands.CreateInviteLinkInput{DocumentID: doc.ID, Caller: owner.ID, Role: document.RoleReader}
		link, err := env.documents.CreateInviteLink(ctx, in)
		if err != nil {
			t.Fatalf("creating link: %v", err)
		}
		if link.Token == "" {
			t.Fatal("expected a non-empty token")
		}

		joined, err := env.documents.JoinViaInviteLink(ctx, link.Token, stranger.ID)
		if err != nil {
			t.Fatalf("joining via link: %v", err)
		}
		if joined.ID != doc.ID {
			t.Fatalf("want %v, got %v", doc.ID, joined.ID)
		}

		members, err := env.documents.ListMembers(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("listing members: %v", err)
		}
		if !hasMemberWithRole(members, stranger.ID, document.RoleReader) {
			t.Fatalf("want %v as a reader, got %+v", stranger.ID, members)
		}
	})

	t.Run("joining twice with the same link is not an error", func(t *testing.T) {
		in := documentcommands.CreateInviteLinkInput{DocumentID: doc.ID, Caller: owner.ID, Role: document.RoleEditor}
		link, err := env.documents.CreateInviteLink(ctx, in)
		if err != nil {
			t.Fatalf("creating link: %v", err)
		}

		if _, err := env.documents.JoinViaInviteLink(ctx, link.Token, stranger.ID); err != nil {
			t.Fatalf("first join: %v", err)
		}
		if _, err := env.documents.JoinViaInviteLink(ctx, link.Token, stranger.ID); err != nil {
			t.Fatalf("re-joining with the same link should be a no-op, got: %v", err)
		}
	})

	t.Run("rotating the link invalidates the old token", func(t *testing.T) {
		firstIn := documentcommands.CreateInviteLinkInput{DocumentID: doc.ID, Caller: owner.ID, Role: document.RoleEditor}
		first, err := env.documents.CreateInviteLink(ctx, firstIn)
		if err != nil {
			t.Fatalf("creating first link: %v", err)
		}

		secondIn := documentcommands.CreateInviteLinkInput{DocumentID: doc.ID, Caller: owner.ID, Role: document.RoleEditor}
		if _, err := env.documents.CreateInviteLink(ctx, secondIn); err != nil {
			t.Fatalf("rotating link: %v", err)
		}

		newStranger := newTestUser(t, env)
		_, err = env.documents.JoinViaInviteLink(ctx, first.Token, newStranger.ID)
		if !errors.Is(err, document.ErrInviteLinkNotFound) {
			t.Fatalf("want %v, got %v", document.ErrInviteLinkNotFound, err)
		}
	})

	t.Run("revoking the link invalidates it", func(t *testing.T) {
		in := documentcommands.CreateInviteLinkInput{DocumentID: doc.ID, Caller: owner.ID, Role: document.RoleEditor}
		link, err := env.documents.CreateInviteLink(ctx, in)
		if err != nil {
			t.Fatalf("creating link: %v", err)
		}

		if err := env.documents.RevokeInviteLink(ctx, doc.ID, owner.ID); err != nil {
			t.Fatalf("revoking: %v", err)
		}

		newStranger := newTestUser(t, env)
		_, err = env.documents.JoinViaInviteLink(ctx, link.Token, newStranger.ID)
		if !errors.Is(err, document.ErrInviteLinkNotFound) {
			t.Fatalf("want %v, got %v", document.ErrInviteLinkNotFound, err)
		}
	})

	// Deleting a document is expected to revoke its sharing link (see
	// DeleteHandler); this must run last since it deletes doc.
	t.Run("deleting the document revokes its link and blocks joining a soft-deleted document", func(t *testing.T) {
		in := documentcommands.CreateInviteLinkInput{DocumentID: doc.ID, Caller: owner.ID, Role: document.RoleEditor}
		link, err := env.documents.CreateInviteLink(ctx, in)
		if err != nil {
			t.Fatalf("creating link: %v", err)
		}

		if err := env.documents.Delete(ctx, doc.ID, owner.ID); err != nil {
			t.Fatalf("deleting document: %v", err)
		}

		lateJoiner := newTestUser(t, env)
		if _, err := env.documents.JoinViaInviteLink(ctx, link.Token, lateJoiner.ID); !errors.Is(err, document.ErrInviteLinkNotFound) {
			t.Fatalf("want %v (link revoked on delete), got %v", document.ErrInviteLinkNotFound, err)
		}

		isMember, err := env.documents.IsMember(ctx, doc.ID, lateJoiner.ID)
		if err != nil {
			t.Fatalf("checking membership: %v", err)
		}
		if isMember {
			t.Fatal("a join attempt against a soft-deleted document must never persist membership")
		}
	})
}

// TestCommentFlow covers posting, listing, resolving, and deleting a
// comment, plus the authorization gate: only a comment's own author or
// the document's owner can resolve or delete it.
func TestCommentFlow(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	member := newTestUser(t, env)
	stranger := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "commented doc")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	addMemberInput := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: owner.ID, Email: member.Email, Role: document.RoleEditor}
	if err := env.documents.AddMemberByEmail(ctx, addMemberInput); err != nil {
		t.Fatalf("adding member: %v", err)
	}

	t.Run("stranger cannot comment", func(t *testing.T) {
		in := documentcommands.CreateCommentInput{DocumentID: doc.ID, AuthorID: stranger.ID, Body: "sneaky"}
		if _, err := env.documents.CreateComment(ctx, in); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})

	in := documentcommands.CreateCommentInput{DocumentID: doc.ID, AuthorID: member.ID, Body: "looks good"}
	created, err := env.documents.CreateComment(ctx, in)
	if err != nil {
		t.Fatalf("creating comment: %v", err)
	}
	if created.Body != "looks good" || created.AuthorID != member.ID {
		t.Fatalf("want body %q by %v, got %q by %v", "looks good", member.ID, created.Body, created.AuthorID)
	}
	if created.ResolvedAt != nil {
		t.Fatal("a freshly posted comment should not be resolved")
	}

	t.Run("comment shows up in the list", func(t *testing.T) {
		comments, err := env.documents.ListComments(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("listing: %v", err)
		}
		if len(comments) != 1 || comments[0].ID != created.ID {
			t.Fatalf("want [%v], got %+v", created.ID, comments)
		}
	})

	t.Run("stranger cannot resolve or delete", func(t *testing.T) {
		if err := env.documents.ResolveComment(ctx, doc.ID, created.ID, stranger.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("resolve: want %v, got %v", document.ErrNotFound, err)
		}
		if err := env.documents.DeleteComment(ctx, doc.ID, created.ID, stranger.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("delete: want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("the owner, who didn't write it, can still resolve it", func(t *testing.T) {
		if err := env.documents.ResolveComment(ctx, doc.ID, created.ID, owner.ID); err != nil {
			t.Fatalf("resolve: %v", err)
		}
		comments, err := env.documents.ListComments(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("listing: %v", err)
		}
		if len(comments) != 1 || comments[0].ResolvedAt == nil {
			t.Fatalf("want the comment resolved, got %+v", comments)
		}
	})

	t.Run("the owner cannot edit a comment they didn't write", func(t *testing.T) {
		in := documentcommands.EditCommentInput{DocumentID: doc.ID, CommentID: created.ID, Caller: owner.ID, Body: "owner sneaking in a rewrite"}
		if err := env.documents.EditComment(ctx, in); !errors.Is(err, document.ErrNotCommentAuthor) {
			t.Fatalf("want %v, got %v", document.ErrNotCommentAuthor, err)
		}
	})

	t.Run("its own author can edit it, and edited_at gets stamped", func(t *testing.T) {
		in := documentcommands.EditCommentInput{DocumentID: doc.ID, CommentID: created.ID, Caller: member.ID, Body: "looks good, fixed a typo"}
		if err := env.documents.EditComment(ctx, in); err != nil {
			t.Fatalf("edit: %v", err)
		}
		comments, err := env.documents.ListComments(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("listing: %v", err)
		}
		if len(comments) != 1 || comments[0].Body != "looks good, fixed a typo" || comments[0].EditedAt == nil {
			t.Fatalf("want the edited body with edited_at set, got %+v", comments)
		}
	})

	t.Run("a fellow member who isn't the author or owner cannot delete", func(t *testing.T) {
		otherMember := newTestUser(t, env)
		addOtherInput := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: owner.ID, Email: otherMember.Email, Role: document.RoleEditor}
		if err := env.documents.AddMemberByEmail(ctx, addOtherInput); err != nil {
			t.Fatalf("adding member: %v", err)
		}
		if err := env.documents.DeleteComment(ctx, doc.ID, created.ID, otherMember.ID); !errors.Is(err, document.ErrNotCommentAuthor) {
			t.Fatalf("want %v, got %v", document.ErrNotCommentAuthor, err)
		}
	})

	t.Run("its own author can delete it", func(t *testing.T) {
		if err := env.documents.DeleteComment(ctx, doc.ID, created.ID, member.ID); err != nil {
			t.Fatalf("delete: %v", err)
		}
		comments, err := env.documents.ListComments(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("listing: %v", err)
		}
		if len(comments) != 0 {
			t.Fatalf("want no comments left, got %+v", comments)
		}
	})
}

func hasMemberWithRole(members []documentdto.MemberView, id user.ID, role document.Role) bool {
	for _, m := range members {
		if m.UserID == id && m.Role == role {
			return true
		}
	}
	return false
}

func findMember(members []documentdto.MemberView, id user.ID) (documentdto.MemberView, bool) {
	for _, m := range members {
		if m.UserID == id {
			return m, true
		}
	}
	return documentdto.MemberView{}, false
}

// TestDocumentDEKFlow is the envelope-encryption acceptance flow
// (docs/CRYPTO.md): the owner wraps the DEK for themselves right after
// creating a document, sharing by email carries a wrapped DEK to the
// invitee immediately, but joining via an invite link leaves a member
// "pending" (no sharer's client is present to do the ECDH wrap
// synchronously) until some existing member completes it later.
func TestDocumentDEKFlow(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	invitee := newTestUser(t, env)
	linkJoiner := newTestUser(t, env)
	stranger := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "dek flow doc")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	ownerDEK := []byte("owner-wrapped-dek-placeholder-bytes")

	t.Run("nobody can fetch a DEK before the owner wraps their own", func(t *testing.T) {
		if _, err := env.documents.GetWrappedDEK(ctx, doc.ID, owner.ID); !errors.Is(err, document.ErrPendingWrappedDEK) {
			t.Fatalf("want %v, got %v", document.ErrPendingWrappedDEK, err)
		}
	})

	t.Run("a stranger cannot set or get a wrapped DEK", func(t *testing.T) {
		setIn := documentcommands.SetMemberWrappedDEKInput{DocumentID: doc.ID, Caller: stranger.ID, TargetUser: stranger.ID, WrappedDEK: ownerDEK}
		if err := env.documents.SetMemberWrappedDEK(ctx, setIn); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
		if _, err := env.documents.GetWrappedDEK(ctx, doc.ID, stranger.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})

	t.Run("the owner wraps their own DEK right after creating", func(t *testing.T) {
		setIn := documentcommands.SetMemberWrappedDEKInput{DocumentID: doc.ID, Caller: owner.ID, TargetUser: owner.ID, WrappedDEK: ownerDEK}
		if err := env.documents.SetMemberWrappedDEK(ctx, setIn); err != nil {
			t.Fatalf("owner wrapping own DEK: %v", err)
		}

		got, err := env.documents.GetWrappedDEK(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if string(got.WrappedDEK) != string(ownerDEK) {
			t.Fatalf("want %v, got %v", ownerDEK, got.WrappedDEK)
		}
	})

	t.Run("email invite carries a wrapped DEK immediately, not pending", func(t *testing.T) {
		inviteeDEK := []byte("invitee-wrapped-dek-placeholder")
		addIn := documentcommands.AddMemberInput{
			DocumentID: doc.ID, Caller: owner.ID, Email: invitee.Email, Role: document.RoleEditor, WrappedDEK: inviteeDEK,
		}
		if err := env.documents.AddMemberByEmail(ctx, addIn); err != nil {
			t.Fatalf("adding member: %v", err)
		}

		members, err := env.documents.ListMembers(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("listing members: %v", err)
		}
		m, ok := findMember(members, invitee.ID)
		if !ok || !m.HasWrappedDEK {
			t.Fatalf("want invitee with a wrapped DEK already, got %+v (found=%v)", m, ok)
		}

		got, err := env.documents.GetWrappedDEK(ctx, doc.ID, invitee.ID)
		if err != nil {
			t.Fatalf("invitee get: %v", err)
		}
		if string(got.WrappedDEK) != string(inviteeDEK) {
			t.Fatalf("want %v, got %v", inviteeDEK, got.WrappedDEK)
		}
	})

	t.Run("joining via invite link leaves the member pending", func(t *testing.T) {
		linkIn := documentcommands.CreateInviteLinkInput{DocumentID: doc.ID, Caller: owner.ID, Role: document.RoleReader}
		link, err := env.documents.CreateInviteLink(ctx, linkIn)
		if err != nil {
			t.Fatalf("creating link: %v", err)
		}
		if _, err := env.documents.JoinViaInviteLink(ctx, link.Token, linkJoiner.ID); err != nil {
			t.Fatalf("joining: %v", err)
		}

		members, err := env.documents.ListMembers(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("listing members: %v", err)
		}
		m, ok := findMember(members, linkJoiner.ID)
		if !ok || m.HasWrappedDEK {
			t.Fatalf("want link-joiner pending (no wrapped DEK yet), got %+v (found=%v)", m, ok)
		}

		if _, err := env.documents.GetWrappedDEK(ctx, doc.ID, linkJoiner.ID); !errors.Is(err, document.ErrPendingWrappedDEK) {
			t.Fatalf("want %v, got %v", document.ErrPendingWrappedDEK, err)
		}
	})

	t.Run("any existing member can complete the pending member's wrap later", func(t *testing.T) {
		linkJoinerDEK := []byte("link-joiner-wrapped-dek-placehold")
		// The invitee (not the owner) completes it — anyone with access
		// can, following docs/CRYPTO.md's "whoever already has access".
		setIn := documentcommands.SetMemberWrappedDEKInput{
			DocumentID: doc.ID, Caller: invitee.ID, TargetUser: linkJoiner.ID, WrappedDEK: linkJoinerDEK,
		}
		if err := env.documents.SetMemberWrappedDEK(ctx, setIn); err != nil {
			t.Fatalf("completing pending wrap: %v", err)
		}

		got, err := env.documents.GetWrappedDEK(ctx, doc.ID, linkJoiner.ID)
		if err != nil {
			t.Fatalf("link-joiner get after reconciliation: %v", err)
		}
		if string(got.WrappedDEK) != string(linkJoinerDEK) {
			t.Fatalf("want %v, got %v", linkJoinerDEK, got.WrappedDEK)
		}

		members, err := env.documents.ListMembers(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("listing members: %v", err)
		}
		if m, ok := findMember(members, linkJoiner.ID); !ok || !m.HasWrappedDEK {
			t.Fatalf("want link-joiner no longer pending, got %+v (found=%v)", m, ok)
		}
	})
}
