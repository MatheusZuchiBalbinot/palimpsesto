const SKELETON_ROW_COUNT = 5;

export function DocListSkeleton() {
	return (
		<ul className="doc-list" aria-hidden="true">
			{Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
				<li key={i} className="doc-card doc-card--skeleton">
					<div className="doc-card__main">
						<div className="skeleton-line skeleton-line--title" />
						<div className="skeleton-line skeleton-line--meta" />
					</div>
				</li>
			))}
		</ul>
	);
}
