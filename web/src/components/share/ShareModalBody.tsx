import { useTranslation } from 'react-i18next';

import type { DocumentId } from '../../api/ids';
import { Button } from '../Button';
import { useModalTitleId } from '../modalTitleContext';
import { InviteLinkSection } from './InviteLinkSection';
import { ShareInviteForm, type ShareInviteFormProps } from './ShareInviteForm';
import { ShareMembersList, type ShareMembersListProps } from './ShareMembersList';

type ShareModalBodyProps = {
	docTitle: string;
	docId: DocumentId;
	inviteForm: ShareInviteFormProps;
	membersList: ShareMembersListProps;
	onRequestLeave: () => void;
	onClose: () => void;
};

export function ShareModalBody({ docTitle, docId, inviteForm, membersList, onRequestLeave, onClose }: Readonly<ShareModalBodyProps>) {
	const { t } = useTranslation();
	const titleId = useModalTitleId();
	return (
		<>
			<div className="share-header">
				<div className="modal-title" id={titleId}>
					{t('share.title')}
				</div>
				<div className="text-sm text-muted" style={{ marginTop: 4 }}>
					{docTitle}
				</div>
				<ShareInviteForm {...inviteForm} />
			</div>

			<InviteLinkSection docId={docId} />

			<ShareMembersList {...membersList} />

			<div className="share-footer">
				<span className="share-footer__hint">{t('share.hint')}</span>
				{membersList.isOwner ? null : (
					<button type="button" className="text-link" onClick={onRequestLeave}>
						{t('share.leave')}
					</button>
				)}
				<Button type="button" variant="secondary" size="sm" style={{ marginLeft: 'auto', flex: 'none' }} onClick={onClose}>
					{t('share.done')}
				</Button>
			</div>
		</>
	);
}
