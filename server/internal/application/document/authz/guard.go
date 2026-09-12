// Package authz is the document application service's shared
// authorization guard — the one place where "can the caller see this
// document" is checked, so every command and query can stop repeating the
// same inline block.
package authz

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// RequireMembership returns document.ErrNotFound if the caller isn't a
// member of docID — "existence itself isn't public information". Every
// command/query that needs the membership gate calls this first.
func RequireMembership(ctx context.Context, membership document.MembershipRepository, docID document.ID, caller user.ID) error {
	isMember, err := membership.IsMember(ctx, docID, caller)
	if err != nil {
		return fmt.Errorf("document: checking membership: %w", err)
	}
	if !isMember {
		return document.ErrNotFound
	}
	return nil
}

// RequireCommentAuthor returns document.ErrNotCommentAuthor unless the
// caller wrote commentID — unlike RequireCommentAuthorOrOwner, the
// document's owner gets no exception here. Editing someone else's words
// isn't the same class of action as moderating them (resolving, deleting);
// only the person who wrote a comment gets to change what it says.
func RequireCommentAuthor(ctx context.Context, comments document.CommentRepository, docID document.ID, commentID document.CommentID, caller user.ID) error {
	authorID, err := comments.FindCommentAuthor(ctx, docID, commentID)
	if errors.Is(err, document.ErrCommentNotFound) {
		return document.ErrCommentNotFound
	}
	if err != nil {
		return fmt.Errorf("document: finding comment author: %w", err)
	}
	if authorID != caller {
		return document.ErrNotCommentAuthor
	}
	return nil
}

// RequireCommentAuthorOrOwner returns document.ErrNotCommentAuthor unless
// the caller either wrote commentID or owns docID — resolving or deleting
// someone else's comment has the same gate as removing a member, but the
// comment's own author gets an exception on top of that.
func RequireCommentAuthorOrOwner(ctx context.Context, membership document.MembershipRepository, comments document.CommentRepository, docID document.ID, commentID document.CommentID, caller user.ID) error {
	authorID, err := comments.FindCommentAuthor(ctx, docID, commentID)
	if errors.Is(err, document.ErrCommentNotFound) {
		return document.ErrCommentNotFound
	}
	if err != nil {
		return fmt.Errorf("document: finding comment author: %w", err)
	}
	if authorID == caller {
		return nil
	}

	role, err := membership.MemberRole(ctx, docID, caller)
	if errors.Is(err, document.ErrNotFound) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("document: checking role: %w", err)
	}
	if !role.IsOwner() {
		return document.ErrNotCommentAuthor
	}
	return nil
}
