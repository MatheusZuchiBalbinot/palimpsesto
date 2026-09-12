package session

// ID identifies a link in a refresh token rotation chain.
type ID string

// FamilyID groups every session descending from a login. Reusing an
// already-rotated refresh token revokes every session sharing its
// FamilyID.
type FamilyID string
