package session

import "errors"

// ErrInvalidRefreshToken covers every reason a presented refresh token
// isn't usable: unknown, expired, or already retired (reuse).
var ErrInvalidRefreshToken = errors.New("session: invalid or expired refresh token")

// ErrRefreshTokenReused means a token that was already retired (rotated)
// was presented again — theft, not a valid rotation. The caller must
// revoke the entire family, not just that session.
var ErrRefreshTokenReused = errors.New("session: refresh token reuse detected")

// ErrNotFound means the referenced session family doesn't exist, or
// doesn't belong to the caller — never distinguished, so revoking a
// device can't be used to probe which family IDs exist for someone else.
var ErrNotFound = errors.New("session: not found")
