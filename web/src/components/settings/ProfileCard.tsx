import { useTranslation } from 'react-i18next';

import { AVATAR_SIZE_PROFILE } from '../../constants';
import { Avatar } from '../Avatar';
import { DocumentTitle } from '../DocumentTitle';

type ProfileCardProps = {
	userId: string;
	name: string;
	email: string | undefined;
	onRenameProfile: (name: string) => void;
};

export function ProfileCard({ userId, name, email, onRenameProfile }: Readonly<ProfileCardProps>) {
	const { t } = useTranslation();
	return (
		<div className="settings-card">
			<div className="settings-card__profile">
				<Avatar id={userId} name={name} size={AVATAR_SIZE_PROFILE} decorative />
				<div style={{ flex: 1 }}>
					<DocumentTitle
						title={name}
						onRename={onRenameProfile}
						viewClassName="settings-card__profile-name"
						editClassName="input"
						renameLabel={t('settings.renameProfileLabel', { name })}
						editLabel={t('settings.editProfileLabel')}
					/>
					<div className="text-sm text-muted" style={{ marginTop: 3 }}>
						{email}
					</div>
				</div>
			</div>
		</div>
	);
}
