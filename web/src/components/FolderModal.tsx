import { Check } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { FolderDTO } from '../api/docTypes';
import type { FolderId } from '../api/ids';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { translateError } from '../i18n/errors';
import { FOLDER_COLORS, type FolderColor } from '../lib/folderColors';
import { Button } from './Button';
import { TextField } from './Input';
import { Modal } from './Modal';
import { useModalClose } from './modalCloseContext';
import { useModalTitleId } from './modalTitleContext';

type FolderModalProps = {
	/** Absent (create) or the folder being renamed/recolored (edit) —
	 * the sidebar's old inline form couldn't do either of these
	 * comfortably: no way to pick a color, no way to edit an existing
	 * folder at all. */
	folder: FolderDTO | null;
	onClose: () => void;
	onCreate: (name: string, color: FolderColor) => Promise<FolderDTO>;
	onUpdate: (folderId: FolderId, name: string, color: FolderColor) => Promise<FolderDTO>;
};

export function FolderModal({ folder, onClose, onCreate, onUpdate }: Readonly<FolderModalProps>) {
	return (
		<Modal onClose={onClose} maxWidth={384}>
			<FolderForm folder={folder} onCreate={onCreate} onUpdate={onUpdate} />
		</Modal>
	);
}

type FolderFormProps = {
	folder: FolderDTO | null;
	onCreate: (name: string, color: FolderColor) => Promise<FolderDTO>;
	onUpdate: (folderId: FolderId, name: string, color: FolderColor) => Promise<FolderDTO>;
};

function FolderForm({ folder, onCreate, onUpdate }: Readonly<FolderFormProps>) {
	const { t } = useTranslation();
	const requestClose = useModalClose();
	const titleId = useModalTitleId();
	const [name, setName] = useState(folder?.name ?? '');
	const [color, setColor] = useState(folder?.color ?? FOLDER_COLORS[0]);

	const [{ isPending, error }, submit] = useAsyncAction(async () => {
		if (folder) {
			await onUpdate(folder.id, name, color);
		} else {
			await onCreate(name, color);
		}
		requestClose();
	});

	function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
		e.preventDefault();
		submit();
	}

	return (
		<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
			<div className="modal-title" id={titleId}>
				{folder ? t('vault.editFolder') : t('vault.newFolder')}
			</div>

			<TextField
				label={t('vault.folderNameLabel')}
				required
				autoFocus
				maxLength={60}
				placeholder={t('vault.newFolderPlaceholder')}
				value={name}
				onChange={(e) => setName(e.target.value)}
			/>

			<FolderColorPicker value={color} onChange={setColor} />

			{error ? (
				<p className="form-error" role="alert">
					{translateError(t, error)}
				</p>
			) : null}

			<div className="modal-actions">
				<Button type="button" variant="secondary" onClick={requestClose}>
					{t('vault.folderCancel')}
				</Button>
				<Button type="submit" disabled={isPending || name.trim() === ''}>
					{folder ? t('vault.folderSave') : t('vault.folderCreate')}
				</Button>
			</div>
		</form>
	);
}

type FolderColorPickerProps = {
	value: FolderColor;
	onChange: (color: FolderColor) => void;
};

function FolderColorPicker({ value, onChange }: Readonly<FolderColorPickerProps>) {
	const { t } = useTranslation();
	return (
		<fieldset className="folder-color-fieldset">
			<legend className="text-xs font-medium text-secondary">{t('vault.folderColorLabel')}</legend>
			<div className="folder-color-grid">
				{FOLDER_COLORS.map((swatch) => (
					<label key={swatch} className="folder-color-swatch" style={{ background: swatch }}>
						<input type="radio" name="folderColor" className="sr-only" value={swatch} checked={value === swatch} onChange={() => onChange(swatch)} />
						{value === swatch ? <Check size={13} aria-hidden="true" /> : null}
						<span className="sr-only">{swatch}</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}
