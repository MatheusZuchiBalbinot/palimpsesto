/** The palette FolderModal's color picker offers — the prototype's own
 * folder dots (sage, bronze, charcoal) plus a few more tokens from the
 * theme, so a folder isn't stuck with whatever color it was created
 * with. Lives outside api/docTypes.ts and hooks/useFolders.ts (both of
 * which use it) so neither has to depend on the other for it. */
export const FOLDER_COLORS = ['#5D7C71', '#8C6A3F', '#4A4740', '#9C3F26', '#3F5C51', '#6E5230'] as const;

export type FolderColor = (typeof FOLDER_COLORS)[number];
