import type { Role } from '../../api/docTypes';

export const READER_LABEL_KEY = 'share.reader';

export const ROLE_LABEL_KEY: Record<Role, string> = {
	owner: 'share.owner',
	editor: 'share.editor',
	reader: READER_LABEL_KEY,
};
