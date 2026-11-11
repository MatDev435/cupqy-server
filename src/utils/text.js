/** Remove espaços extras; retorna null para strings vazias. */
export function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  return maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

/** Mantém apenas os dígitos (telefone, CEP). Retorna null se não sobrar nenhum. */
export function onlyDigits(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  return digits || null;
}

/** Gera um slug simples a partir de um texto (ex.: "Sem Glúten" → "sem-gluten"). */
export function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
