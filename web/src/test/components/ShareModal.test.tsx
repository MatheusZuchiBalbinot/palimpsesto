import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInvite, getInviteLink, listInvitesForDocument, listMembers } from '../../api/docs';
import { toDocumentId, toInviteId, toUserId } from '../../api/ids';
import { lookupUser } from '../../api/keys';
import { ShareModal } from '../../components/ShareModal';
import { bytesToBase64, generateIdentityKeyPair } from '../../crypto/identity';

import '../../i18n/config';

vi.mock('../../api/docs', () => ({
	listMembers: vi.fn(),
	createInvite: vi.fn(),
	cancelInvite: vi.fn(),
	listInvitesForDocument: vi.fn(),
	removeMember: vi.fn(),
	getInviteLink: vi.fn(),
	createInviteLink: vi.fn(),
	revokeInviteLink: vi.fn(),
}));
vi.mock('../../api/keys', () => ({
	lookupUser: vi.fn(),
}));

const mockedListMembers = vi.mocked(listMembers);
const mockedCreateInvite = vi.mocked(createInvite);
const mockedListInvitesForDocument = vi.mocked(listInvitesForDocument);
const mockedGetInviteLink = vi.mocked(getInviteLink);
const mockedLookupUser = vi.mocked(lookupUser);

const DEK_LENGTH = 32;
const ARBITRARY_DEK_FILL_BYTE = 7;
const DOCUMENT_KEY = {
	dek: new Uint8Array(DEK_LENGTH).fill(ARBITRARY_DEK_FILL_BYTE),
	keyEpoch: 1,
};
const INVITE_EMAIL_PLACEHOLDER = 'Convidar por e-mail';

// Regression test for a real bug, found via screenshot: ShareModal used to
// render KeyChangeWarning/ConfirmModal as a *second* <Modal>, nested inside
// its own already-open one — two independent translucent scrims stacked,
// with the first dialog's content visibly bleeding through the second. Fixed
// by having ShareModal render the *Content variants inline, taking over its
// single card instead. These tests pin down "exactly one modal-overlay
// exists," not just "the warning eventually appears."
describe('ShareModal', () => {
	beforeEach(() => {
		mockedListMembers.mockReset();
		mockedCreateInvite.mockReset();
		mockedListInvitesForDocument.mockReset();
		mockedGetInviteLink.mockReset();
		mockedLookupUser.mockReset();
		localStorage.clear();

		mockedListMembers.mockResolvedValue([
			{
				user_id: toUserId('owner1'),
				email: 'owner@example.com',
				display_name: 'Owner',
				role: 'owner',
				has_wrapped_dek: true,
			},
		]);
		mockedListInvitesForDocument.mockResolvedValue([]);
		mockedGetInviteLink.mockRejectedValue(Object.assign(new Error('404'), { code: 'invite_link_not_found' }));
	});

	it('shows the key-change warning inline, as the only modal overlay on screen', async () => {
		const bob = generateIdentityKeyPair();
		// A different key already trusted for bob than the one lookupUser will
		// return below — exactly the "changed" status that should block the
		// invite instead of silently wrapping the DEK against it.
		localStorage.setItem('palimpsesto:knownKey:bob1', JSON.stringify({ identityPub: 'd3Jvbmcta2V5', signingPub: 'd3Jvbmcta2V5' }));
		mockedLookupUser.mockResolvedValue({
			user_id: toUserId('bob1'),
			identity_pub: bytesToBase64(bob.identityPublic),
			signing_pub: bytesToBase64(bob.signingPublic),
			fingerprint: 'irrelevant',
			display_name: 'irrelevant',
		});

		render(
			<ShareModal
				docId={toDocumentId('doc1')}
				docTitle="Documento de teste"
				documentKey={DOCUMENT_KEY}
				ownUserId={toUserId('owner1')}
				onKeyRotated={vi.fn()}
				onLeft={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		await waitFor(() => expect(screen.getByText('Owner')).toBeInTheDocument());

		fireEvent.change(screen.getByPlaceholderText(INVITE_EMAIL_PLACEHOLDER), {
			target: { value: 'bob@example.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Convidar' }));

		await waitFor(() => expect(screen.getByText('A chave de identidade mudou')).toBeInTheDocument());

		// The bug: this used to be 2 (ShareModal's own overlay, plus a second
		// nested one for the warning). There should always be just one.
		expect(document.querySelectorAll('.modal-overlay')).toHaveLength(1);
		// And the invite form "underneath" can't keep showing — the warning
		// takes over the card, it doesn't share it.
		expect(screen.queryByPlaceholderText(INVITE_EMAIL_PLACEHOLDER)).not.toBeInTheDocument();

		expect(mockedCreateInvite).not.toHaveBeenCalled();
	});

	it('completes the invite once the new key is explicitly confirmed, and returns to the normal share view', async () => {
		const bob = generateIdentityKeyPair();
		localStorage.setItem('palimpsesto:knownKey:bob1', JSON.stringify({ identityPub: 'd3Jvbmcta2V5', signingPub: 'd3Jvbmcta2V5' }));
		mockedLookupUser.mockResolvedValue({
			user_id: toUserId('bob1'),
			identity_pub: bytesToBase64(bob.identityPublic),
			signing_pub: bytesToBase64(bob.signingPublic),
			fingerprint: 'irrelevant',
			display_name: 'irrelevant',
		});
		mockedCreateInvite.mockResolvedValue({
			id: toInviteId('invite1'),
			inviter_name: 'Owner',
			inviter_email: 'owner@example.com',
			invitee_name: '',
			invitee_email: 'bob@example.com',
			role: 'editor',
			created_at: new Date().toISOString(),
		});

		render(
			<ShareModal
				docId={toDocumentId('doc1')}
				docTitle="Documento de teste"
				documentKey={DOCUMENT_KEY}
				ownUserId={toUserId('owner1')}
				onKeyRotated={vi.fn()}
				onLeft={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		await waitFor(() => expect(screen.getByText('Owner')).toBeInTheDocument());
		fireEvent.change(screen.getByPlaceholderText(INVITE_EMAIL_PLACEHOLDER), {
			target: { value: 'bob@example.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Convidar' }));
		await waitFor(() => expect(screen.getByText('A chave de identidade mudou')).toBeInTheDocument());

		fireEvent.click(screen.getByRole('button', { name: 'Confere, confiar nesta chave' }));

		await waitFor(() => expect(mockedCreateInvite).toHaveBeenCalledTimes(1));
		expect(mockedCreateInvite.mock.calls[0][0]).toBe('doc1');
		expect(mockedCreateInvite.mock.calls[0][1]).toMatchObject({ email: 'bob@example.com' });

		// Back to the normal share view — the warning doesn't persist.
		await waitFor(() => expect(screen.getByPlaceholderText(INVITE_EMAIL_PLACEHOLDER)).toBeInTheDocument());
		expect(document.querySelectorAll('.modal-overlay')).toHaveLength(1);
	});
});
