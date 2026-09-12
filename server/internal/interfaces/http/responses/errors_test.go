package responses_test

import (
	"errors"
	"net/http"
	"testing"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/session"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/interfaces/http/responses"
)

// TestUserError exhaustively covers every sentinel error UserError
// knows how to translate, plus the default fallback for anything it
// doesn't — a single unmapped error must never leak as anything but a
// generic 500, never a raw Go error string.
func TestUserError(t *testing.T) {
	cases := []struct {
		err        error
		wantStatus int
		wantCode   string
	}{
		{user.ErrEmailTaken, http.StatusConflict, "email_taken"},
		{user.ErrInvalidCredentials, http.StatusUnauthorized, "invalid_credentials"},
		{session.ErrInvalidRefreshToken, http.StatusUnauthorized, "invalid_refresh_token"},
		{session.ErrNotFound, http.StatusNotFound, "device_not_found"},
		{user.ErrNotFound, http.StatusNotFound, "user_not_found"},
		{user.ErrKeysNotFound, http.StatusNotFound, "keys_not_found"},
		{user.ErrInvalidPublicKeys, http.StatusBadRequest, "invalid_public_keys"},
		{user.ErrInvalidSalt, http.StatusBadRequest, "invalid_salt"},
		{user.ErrPrivateKeysNotFound, http.StatusNotFound, "private_keys_not_found"},
		{user.ErrInvalidPrivateKeys, http.StatusBadRequest, "invalid_private_keys"},
		{user.ErrInvalidDisplayName, http.StatusBadRequest, "invalid_display_name"},
		{user.ErrLoginKeyTooShort, http.StatusBadRequest, "login_key_too_short"},
		{errors.New("something no case maps"), http.StatusInternalServerError, "internal_error"},
	}

	for _, tc := range cases {
		t.Run(tc.wantCode, func(t *testing.T) {
			status, code, message := responses.UserError(tc.err)
			if status != tc.wantStatus {
				t.Errorf("status: want %d, got %d", tc.wantStatus, status)
			}
			if code != tc.wantCode {
				t.Errorf("code: want %q, got %q", tc.wantCode, code)
			}
			if message == "" {
				t.Error("want a non-empty user-facing message")
			}
		})
	}

	t.Run("wrapped errors still match via errors.Is", func(t *testing.T) {
		wrapped := fmtErrorf(user.ErrEmailTaken)
		status, code, _ := responses.UserError(wrapped)
		if status != http.StatusConflict || code != "email_taken" {
			t.Fatalf("want a wrapped ErrEmailTaken to still map to email_taken/409, got %d/%q", status, code)
		}
	})
}

// TestDocumentError exhaustively covers every sentinel error
// DocumentError knows how to translate, plus its default fallback.
func TestDocumentError(t *testing.T) {
	cases := []struct {
		err        error
		wantStatus int
		wantCode   string
	}{
		{document.ErrNotFound, http.StatusNotFound, "not_found"},
		{document.ErrNotOwner, http.StatusForbidden, "not_owner"},
		{document.ErrAlreadyAdded, http.StatusConflict, "already_member"},
		{document.ErrUserNotFound, http.StatusNotFound, "user_not_found"},
		{document.ErrInviteLinkNotFound, http.StatusNotFound, "invite_link_not_found"},
		{document.ErrCommentNotFound, http.StatusNotFound, "comment_not_found"},
		{document.ErrNotCommentAuthor, http.StatusForbidden, "not_comment_author"},
		{document.ErrPendingWrappedDEK, http.StatusNotFound, "pending_wrapped_dek"},
		{document.ErrCannotRemoveOwner, http.StatusForbidden, "cannot_remove_owner"},
		{document.ErrIncompleteRotation, http.StatusBadRequest, "incomplete_rotation"},
		{document.ErrNotEditor, http.StatusForbidden, "not_editor"},
		{document.ErrSnapshotNotFound, http.StatusNotFound, "snapshot_not_found"},
		{document.ErrInvalidRole, http.StatusBadRequest, "invalid_role"},
		{document.ErrCannotChangeOwnRole, http.StatusForbidden, "cannot_change_own_role"},
		{document.ErrFolderNotFound, http.StatusNotFound, "folder_not_found"},
		{document.ErrInvalidFolderName, http.StatusBadRequest, "invalid_folder_name"},
		{document.ErrInviteNotFound, http.StatusNotFound, "invite_not_found"},
		{document.ErrAlreadyInvited, http.StatusConflict, "already_invited"},
		{document.ErrInviteStale, http.StatusConflict, "invite_stale"},
		{document.ErrWrappedDEKAlreadySet, http.StatusConflict, "wrapped_dek_already_set"},
		{errors.New("something no case maps"), http.StatusInternalServerError, "internal_error"},
	}

	for _, tc := range cases {
		t.Run(tc.wantCode, func(t *testing.T) {
			status, code, message := responses.DocumentError(tc.err)
			if status != tc.wantStatus {
				t.Errorf("status: want %d, got %d", tc.wantStatus, status)
			}
			if code != tc.wantCode {
				t.Errorf("code: want %q, got %q", tc.wantCode, code)
			}
			if message == "" {
				t.Error("want a non-empty user-facing message")
			}
		})
	}
}

func fmtErrorf(err error) error {
	return errWrap{err}
}

// errWrap is a minimal errors.Is-compatible wrapper, avoiding a fmt
// import just to call fmt.Errorf("%w", err) once.
type errWrap struct{ err error }

func (e errWrap) Error() string { return "wrapped: " + e.err.Error() }
func (e errWrap) Unwrap() error { return e.err }
