// Package responses holds the HTTP response DTOs and the domain
// error → HTTP status translation. This is the only place that
// translation happens — see docs/ARCHITECTURE.md.
package responses

import (
	"encoding/json"
	"errors"
	"net/http"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/session"
	"palimpsesto/internal/domain/user"
)

// UserError maps a user/session domain sentinel error to its HTTP
// status, error code, and user-facing message.
func UserError(err error) (status int, code string, message string) {
	switch {
	case errors.Is(err, user.ErrEmailTaken):
		return http.StatusConflict, "email_taken", "e-mail já cadastrado"
	case errors.Is(err, user.ErrInvalidCredentials):
		return http.StatusUnauthorized, "invalid_credentials", "e-mail ou senha inválidos"
	case errors.Is(err, session.ErrInvalidRefreshToken):
		return http.StatusUnauthorized, "invalid_refresh_token", "sessão expirada, faça login novamente"
	case errors.Is(err, session.ErrNotFound):
		return http.StatusNotFound, "device_not_found", "dispositivo não encontrado"
	case errors.Is(err, user.ErrNotFound):
		return http.StatusNotFound, "user_not_found", "nenhum usuário com esse e-mail"
	case errors.Is(err, user.ErrKeysNotFound):
		return http.StatusNotFound, "keys_not_found", "esse usuário ainda não publicou chaves"
	case errors.Is(err, user.ErrInvalidPublicKeys):
		return http.StatusBadRequest, "invalid_public_keys", "chaves públicas inválidas"
	case errors.Is(err, user.ErrInvalidSalt):
		return http.StatusBadRequest, "invalid_salt", "salt_mk inválido"
	case errors.Is(err, user.ErrPrivateKeysNotFound):
		return http.StatusNotFound, "private_keys_not_found", "nenhuma chave privada publicada para este usuário"
	case errors.Is(err, user.ErrInvalidPrivateKeys):
		return http.StatusBadRequest, "invalid_private_keys", "chaves privadas cifradas inválidas"
	case errors.Is(err, user.ErrInvalidDisplayName):
		return http.StatusBadRequest, "invalid_display_name", "o nome de exibição precisa ter entre 1 e 80 caracteres"
	case errors.Is(err, user.ErrLoginKeyTooShort):
		return http.StatusBadRequest, "login_key_too_short", "a senha precisa ter pelo menos 8 caracteres"
	default:
		return http.StatusInternalServerError, "internal_error", "erro interno"
	}
}

// DocumentError maps a document domain sentinel error to its HTTP
// status, error code, and user-facing message — same pattern as
// UserError.
func DocumentError(err error) (status int, code string, message string) {
	switch {
	case errors.Is(err, document.ErrNotFound):
		return http.StatusNotFound, "not_found", "documento não encontrado"
	case errors.Is(err, document.ErrNotOwner):
		return http.StatusForbidden, "not_owner", "só o dono pode fazer isso"
	case errors.Is(err, document.ErrAlreadyAdded):
		return http.StatusConflict, "already_member", "usuário já é membro"
	case errors.Is(err, document.ErrUserNotFound):
		return http.StatusNotFound, "user_not_found", "nenhum usuário com esse e-mail"
	case errors.Is(err, document.ErrInviteLinkNotFound):
		return http.StatusNotFound, "invite_link_not_found", "link inválido ou revogado"
	case errors.Is(err, document.ErrCommentNotFound):
		return http.StatusNotFound, "comment_not_found", "comentário não encontrado"
	case errors.Is(err, document.ErrNotCommentAuthor):
		return http.StatusForbidden, "not_comment_author", "só quem escreveu o comentário ou o dono do documento pode fazer isso"
	case errors.Is(err, document.ErrPendingWrappedDEK):
		return http.StatusNotFound, "pending_wrapped_dek", "ninguém ainda envelopou a chave do documento para você"
	case errors.Is(err, document.ErrCannotRemoveOwner):
		return http.StatusForbidden, "cannot_remove_owner", "o dono não pode se remover do documento"
	case errors.Is(err, document.ErrIncompleteRotation):
		return http.StatusBadRequest, "incomplete_rotation", "a rotação precisa envelopar a chave nova pra todos os membros restantes"
	case errors.Is(err, document.ErrNotEditor):
		return http.StatusForbidden, "not_editor", "leitores não podem editar o documento"
	case errors.Is(err, document.ErrSnapshotNotFound):
		return http.StatusNotFound, "snapshot_not_found", "este documento ainda não tem nenhum snapshot"
	case errors.Is(err, document.ErrInvalidRole):
		return http.StatusBadRequest, "invalid_role", "o papel precisa ser editor ou leitor"
	case errors.Is(err, document.ErrCannotChangeOwnRole):
		return http.StatusForbidden, "cannot_change_own_role", "o papel do dono não pode ser alterado"
	case errors.Is(err, document.ErrFolderNotFound):
		return http.StatusNotFound, "folder_not_found", "pasta não encontrada"
	case errors.Is(err, document.ErrInvalidFolderName):
		return http.StatusBadRequest, "invalid_folder_name", "o nome da pasta precisa ter entre 1 e 60 caracteres"
	case errors.Is(err, document.ErrInviteNotFound):
		return http.StatusNotFound, "invite_not_found", "convite não encontrado"
	case errors.Is(err, document.ErrAlreadyInvited):
		return http.StatusConflict, "already_invited", "esse usuário já tem um convite pendente para este documento"
	case errors.Is(err, document.ErrInviteStale):
		return http.StatusConflict, "invite_stale", "a chave deste documento mudou desde que o convite foi enviado"
	case errors.Is(err, document.ErrWrappedDEKAlreadySet):
		return http.StatusConflict, "wrapped_dek_already_set", "a chave deste membro já foi envelopada"
	default:
		return http.StatusInternalServerError, "internal_error", "erro interno"
	}
}

// WriteError writes a standard {"error":{"code","message"}} JSON body.
func WriteError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]string{"code": code, "message": message},
	})
}
