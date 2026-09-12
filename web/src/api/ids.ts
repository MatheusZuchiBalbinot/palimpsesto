// Opaque identifier types — every id in this app is a UUID (or, for
// InviteToken, a random URL-safe string), so they're all structurally
// `string` at runtime and TypeScript alone can't tell a DocumentId from a
// FolderId from a plain display name. That's exactly the gap this file
// closes: each id gets a distinct nominal type via a unique brand field
// that only exists at the type level (no such field is ever actually set
// on the value), so passing a FolderId where a DocumentId is expected is
// a compile error, and swapping the order of two same-shaped positional
// arguments (a real, silent bug otherwise) gets caught too.
//
// DTOs across api/*Types.ts declare their id fields with these types
// directly — since apiFetch's `res.json() as Promise<T>` already trusts
// the response's shape completely, values arrive "pre-branded" for free,
// no runtime wrapping needed. The `to*Id` functions below exist only for
// the other direction: turning a bare `string` from outside the API
// layer (a route param, a locally-typed value) into the branded type at
// the one point that does the trusting, instead of silently everywhere.
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type DocumentId = Brand<string, 'DocumentId'>;
export type UserId = Brand<string, 'UserId'>;
export type FolderId = Brand<string, 'FolderId'>;
export type CommentId = Brand<string, 'CommentId'>;
export type InviteId = Brand<string, 'InviteId'>;
export type FamilyId = Brand<string, 'FamilyId'>;
export type InviteToken = Brand<string, 'InviteToken'>;

export function toDocumentId(id: string): DocumentId {
	return id as DocumentId;
}
export function toUserId(id: string): UserId {
	return id as UserId;
}
export function toFolderId(id: string): FolderId {
	return id as FolderId;
}
export function toCommentId(id: string): CommentId {
	return id as CommentId;
}
export function toInviteId(id: string): InviteId {
	return id as InviteId;
}
export function toFamilyId(id: string): FamilyId {
	return id as FamilyId;
}
export function toInviteToken(token: string): InviteToken {
	return token as InviteToken;
}
