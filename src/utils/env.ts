/**
 * Read an API key / secret from the environment.
 *
 * Docker Compose's env_file keeps inline comments as part of the value, so a line
 * like `GUARDIAN_API_KEY=   # https://...` becomes the "key" "# https://...".
 * Treat such values, and obvious placeholders, as "not set".
 */
export function envSecret(name: string): string {
  const v = (process.env[name] ?? '').trim();
  if (!v || v.startsWith('#') || /^your[_-].*(here|key)$/i.test(v)) return '';
  return v;
}
