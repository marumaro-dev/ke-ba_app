export const surfaceValues = {
  turf: { canonical: "turf", legacy: "芝", legacyMojibake: "闃" },
  dirt: { canonical: "dirt", legacy: "ダート", legacyMojibake: "繝繝ｼ繝" },
} as const;

export function normalizeSurface(surface: string): "turf" | "dirt" | "other" {
  const value = surface.trim().toLowerCase();

  if (
    value === surfaceValues.turf.canonical ||
    surface.includes(surfaceValues.turf.legacy) ||
    surface.includes(surfaceValues.turf.legacyMojibake)
  ) {
    return "turf";
  }

  if (
    value === surfaceValues.dirt.canonical ||
    surface.includes(surfaceValues.dirt.legacy) ||
    surface.includes(surfaceValues.dirt.legacyMojibake)
  ) {
    return "dirt";
  }

  return "other";
}
