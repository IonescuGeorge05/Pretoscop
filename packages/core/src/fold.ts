/** ASCII-folded, lower-case words separated by single spaces ("Apă de toaletă, 100 ml" → "apa de toaleta 100 ml"). */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șşȘŞ]/g, 's')
    .replace(/[țţȚŢ]/g, 't')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
