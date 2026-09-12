import { useEffect, useState } from 'react';

import { computeFingerprint, identityHash } from '../crypto/identity';
import { loadIdentityKeyPair } from '../crypto/identityStore';
import type { useSession } from './useSession';

export type SettingsIdentity = {
	hash: ReturnType<typeof identityHash>;
	fingerprint: string;
};

/** The fingerprint/sigil hash of the local identity keys, or null until
 * they're cached on this device (crypto/identityStore.ts). */
export function useSettingsIdentity(session: ReturnType<typeof useSession>): SettingsIdentity | null {
	const [identity, setIdentity] = useState<SettingsIdentity | null>(null);

	useEffect(() => {
		if (!session) {
			// oxlint-disable-next-line react/set-state-in-effect -- intentional: synchronizing with the session param, not a derivable render value
			setIdentity(null);
			return;
		}
		let isCancelled = false;
		void loadIdentityKeyPair(session.user.user_id).then((keys) => {
			if (isCancelled) {
				return;
			}
			if (!keys) {
				setIdentity(null);
				return;
			}
			setIdentity({
				hash: identityHash(keys.identityPublic, keys.signingPublic),
				fingerprint: computeFingerprint(keys.identityPublic, keys.signingPublic),
			});
		});
		return () => {
			isCancelled = true;
		};
	}, [session]);

	return identity;
}
