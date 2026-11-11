/** Centavos (inteiro) → reais (número com 2 casas), formato exigido pelo Mercado Pago. */
export function centsToReais(cents) {
  return Math.round(cents) / 100;
}

/** Reais (número do gateway) → centavos, sem erros de ponto flutuante. */
export function reaisToCents(value) {
  return Math.round(Number(value) * 100);
}
