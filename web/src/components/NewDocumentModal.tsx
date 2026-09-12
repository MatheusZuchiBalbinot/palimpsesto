import { useId, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { createDocument, updateDocument } from '../api/docs';
import type { DocumentId } from '../api/ids';
import { getSession } from '../auth/session';
import { IMPORT_MAX_FILE_BYTES } from '../constants';
import { encryptTitle, type EncryptTitleParams } from '../crypto/documentCipher';
import { createAndWrapOwnDEK } from '../crypto/documentDek';
import { bytesToBase64 } from '../crypto/identity';
import { loadIdentityKeyPair } from '../crypto/identityStore';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { translateError } from '../i18n/errors';
import { restoreDocumentText, type RestoreDocumentTextParams } from '../realtime/restore';
import { Button } from './Button';
import { buttonClassName } from './buttonClassName';
import { TextField } from './Input';
import { Modal } from './Modal';
import { useModalClose } from './modalCloseContext';
import { useModalTitleId } from './modalTitleContext';

type NewDocumentModalProps = {
	onClose: () => void;
	onCreated: (id: DocumentId) => void;
};

export function NewDocumentModal({ onClose, onCreated }: Readonly<NewDocumentModalProps>) {
	return (
		<Modal onClose={onClose} maxWidth={432}>
			<NewDocumentForm onCreated={onCreated} />
		</Modal>
	);
}

type StartFrom = 'blank' | 'agenda' | 'dated' | 'import';

const START_FROM_OPTIONS: { value: StartFrom; labelKey: string }[] = [
	{ value: 'blank', labelKey: 'newDocumentModal.blank' },
	{ value: 'agenda', labelKey: 'newDocumentModal.agenda' },
	{ value: 'dated', labelKey: 'newDocumentModal.dated' },
	{ value: 'import', labelKey: 'newDocumentModal.import' },
];

/** "Título do relatório.txt" → "Título do relatório" — used to pre-fill
 * the title field from an imported file's name, when the title is still
 * blank. */
function stripExtension(fileName: string): string {
	const dotIndex = fileName.lastIndexOf('.');
	return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

type CreateNewDocumentParams = {
	title: string;
	startFrom: StartFrom;
	templateText: string;
};

/** Creates a document, wraps a new DEK for its own creator, and encrypts the
 * title — then, if a template was chosen, restores that template as the
 * document's initial content (the same "restore lands as a new layer" write
 * that realtime/restore.ts uses for History restoration). Returns the new
 * document's id. */
async function createNewDocument({ title, startFrom, templateText }: CreateNewDocumentParams): Promise<DocumentId> {
	const session = getSession();
	if (!session) {
		throw new Error('creating a document with no active session');
	}

	const identity = await loadIdentityKeyPair(session.user.user_id);
	if (!identity) {
		throw new Error('no local identity yet — cannot encrypt a new document');
	}

	// The title's AAD binds the document's real id (docs/CRYPTO.md), which
	// the server only assigns on creation — so this creates first with an
	// empty placeholder title (nothing sensitive in an empty string), then
	// immediately overwrites it with the properly encrypted title once the
	// real id exists.
	const created = await createDocument({ title_ciphertext: '' });

	// A fresh DEK per document, sealed for the creator right away — there's
	// no one to share with yet.
	const newKey = await createAndWrapOwnDEK(created.id, session.user.user_id, identity.identityPublic);

	const encryptTitleInput: EncryptTitleParams = { dek: newKey.dek, docId: created.id, keyEpoch: newKey.keyEpoch, title };
	const encryptedTitle = encryptTitle(encryptTitleInput);
	await updateDocument(created.id, { title_ciphertext: bytesToBase64(encryptedTitle) });

	if (startFrom !== 'blank') {
		const restoreInput: RestoreDocumentTextParams = {
			docId: created.id,
			token: session.accessToken,
			text: templateText,
			userId: session.user.user_id,
			signingPrivate: identity.signingPrivate,
			keyRing: [newKey],
		};
		await restoreDocumentText(restoreInput);
	}

	return created.id;
}

type ImportedFile = {
	name: string;
	text: string;
};

/** Separated from NewDocumentForm's own state purely to keep that
 * component's line count sane — this isn't a shared hooks/ hook, just a
 * local grouping of the "Importar" tile's own file-reading state. */
function useFileImport(onNamed: (name: string) => void) {
	const { t } = useTranslation();
	const [importedFile, setImportedFile] = useState<ImportedFile | null>(null);
	const [importError, setImportError] = useState<string | null>(null);

	async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = '';
		if (!file) {
			return;
		}
		if (file.size > IMPORT_MAX_FILE_BYTES) {
			setImportError(t('newDocumentModal.importTooLarge'));
			setImportedFile(null);
			return;
		}
		const text = await file.text();
		setImportError(null);
		setImportedFile({ name: file.name, text });
		onNamed(stripExtension(file.name));
	}

	return { importedFile, importError, handleFileChange };
}

// Separated from NewDocumentModal so useModalClose() resolves to *this*
// modal's close animation — only works when called from inside the Modal's
// own children, not from the component that renders <Modal> in the first
// place.
function NewDocumentForm({ onCreated }: Readonly<{ onCreated: (id: DocumentId) => void }>) {
	const { t, i18n } = useTranslation();
	const requestClose = useModalClose();
	const titleId = useModalTitleId();
	const [title, setTitle] = useState('');
	const [startFrom, setStartFrom] = useState<StartFrom>('blank');
	const { importedFile, importError, handleFileChange } = useFileImport((name) => setTitle((current) => current || name));

	const canSubmit = startFrom !== 'import' || importedFile !== null;

	const [{ isPending, error }, submit] = useAsyncAction(async () => {
		const templateText = templateTextFor({ startFrom, importedFile, t, locale: i18n.language });
		const id = await createNewDocument({ title, startFrom, templateText });
		onCreated(id);
	});

	function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
		e.preventDefault();
		submit();
	}

	return (
		<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
			<div className="modal-title" id={titleId}>
				{t('newDocumentModal.title')}
			</div>

			<TextField
				label={t('newDocumentModal.titleLabel')}
				required
				autoFocus
				className="input--title"
				placeholder={t('newDocumentModal.titlePlaceholder')}
				value={title}
				onChange={(e) => setTitle(e.target.value)}
			/>

			<StartFromPicker value={startFrom} onChange={setStartFrom} />

			{startFrom === 'import' ? <ImportFilePicker importedFile={importedFile} importError={importError} onFileChange={handleFileChange} /> : null}

			{error ? (
				<p className="form-error" role="alert">
					{translateError(t, error)}
				</p>
			) : null}

			<div className="modal-actions">
				<Button type="button" variant="secondary" onClick={requestClose}>
					{t('newDocumentModal.cancel')}
				</Button>
				<Button type="submit" disabled={isPending || !canSubmit}>
					{t('newDocumentModal.create')}
				</Button>
			</div>
		</form>
	);
}

type TemplateTextForParams = {
	startFrom: StartFrom;
	importedFile: ImportedFile | null;
	t: (key: string, options?: Record<string, unknown>) => string;
	locale: string;
};

const TEMPLATE_TEXT_FOR: Record<StartFrom, (params: TemplateTextForParams) => string> = {
	blank: () => '',
	agenda: ({ t }) => t('newDocumentModal.agendaTemplate'),
	dated: ({ t, locale }) => t('newDocumentModal.datedTemplate', { date: new Date().toLocaleDateString(locale) }),
	import: ({ importedFile }) => importedFile?.text ?? '',
};

function templateTextFor(params: TemplateTextForParams): string {
	return TEMPLATE_TEXT_FOR[params.startFrom](params);
}

type ImportFilePickerProps = {
	importedFile: ImportedFile | null;
	importError: string | null;
	onFileChange: (e: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
};

/** The "Importar" tile's own controls, shown only once that tile is
 * selected — a real file read (FileReader via File.text()), not the
 * disabled placeholder this used to be. Limited to plain text: the editor
 * itself is a plain textarea, so anything richer (.docx, .pdf) would just
 * import as unreadable binary noise. */
function ImportFilePicker({ importedFile, importError, onFileChange }: Readonly<ImportFilePickerProps>) {
	const { t } = useTranslation();
	const fileInputId = useId();
	return (
		<div className="import-file-picker">
			<input type="file" id={fileInputId} accept=".txt,.md,text/plain,text/markdown" className="sr-only" onChange={(e) => void onFileChange(e)} />
			<label htmlFor={fileInputId} className={buttonClassName('secondary', 'sm')}>
				{importedFile ? t('newDocumentModal.importChangeFile') : t('newDocumentModal.importChooseFile')}
			</label>
			{importedFile ? <span className="import-file-picker__name">{importedFile.name}</span> : null}
			{importError ? (
				<p className="form-error" role="alert">
					{importError}
				</p>
			) : null}
		</div>
	);
}

type StartFromPickerProps = {
	value: StartFrom;
	onChange: (value: StartFrom) => void;
};

function StartFromPicker({ value, onChange }: Readonly<StartFromPickerProps>) {
	const { t } = useTranslation();
	return (
		<fieldset className="start-from-fieldset" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
			<legend>{t('newDocumentModal.startFrom')}</legend>
			<div className="start-from-grid">
				{START_FROM_OPTIONS.map((option) => (
					<label key={option.value} className={`start-from-option${value === option.value ? ' selected' : ''}`}>
						<input
							type="radio"
							name="startFrom"
							className="sr-only"
							value={option.value}
							checked={value === option.value}
							onChange={() => onChange(option.value)}
						/>
						{t(option.labelKey)}
					</label>
				))}
			</div>
		</fieldset>
	);
}
