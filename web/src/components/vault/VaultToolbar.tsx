import { ArrowUpDown, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { SortMode } from '../../lib/vaultDocuments';
import { Button } from '../Button';

type VaultToolbarProps = {
	search: string;
	onSearchChange: (value: string) => void;
	sortMode: SortMode;
	onCycleSort: () => void;
};

export function VaultToolbar({ search, onSearchChange, sortMode, onCycleSort }: Readonly<VaultToolbarProps>) {
	const { t } = useTranslation();
	return (
		<div className="vault-toolbar">
			<div className="vault-search">
				<Search size={13} className="vault-search__icon" />
				<input
					type="search"
					aria-label={t('vault.search')}
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					placeholder={t('vault.search')}
					style={{
						border: 'none',
						background: 'none',
						font: 'inherit',
						color: 'inherit',
						width: '100%',
					}}
				/>
				<kbd className="vault-search__kbd">Ctrl+K</kbd>
			</div>
			<div className="vault-toolbar__actions">
				<Button size="sm" variant="secondary" icon={<ArrowUpDown size={14} />} onClick={onCycleSort}>
					{t(`vault.sort.${sortMode}`)}
				</Button>
			</div>
		</div>
	);
}
