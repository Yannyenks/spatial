/** Converts a name into a URL-safe slug base (e.g. "Hotel Riviera" -> "hotel-riviera"). */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "space";
}

/** Appends a short random suffix to reduce collisions before a uniqueness check. */
export function withRandomSuffix(base: string): string {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}
