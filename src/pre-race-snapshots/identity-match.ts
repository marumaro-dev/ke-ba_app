/** Compare complete names only. A raw marker may be restored verbatim, never interpreted. */
export function matchesSnapshotHorseName(
  rawName: string | null,
  rawMarker: string | null,
  candidateName: string | null,
): boolean {
  if (!rawName || !candidateName) return false;
  return candidateName === rawName
    || (Boolean(rawMarker) && candidateName === rawMarker + rawName);
}

export function matchesSnapshotJockeyName(
  rawName: string | null,
  candidateName: string | null,
): boolean {
  return Boolean(rawName) && candidateName === rawName;
}
