/** Converte { page, pageSize } em { skip, take } do Prisma. */
export function toSkipTake({ page, pageSize }) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Metadados padronizados de paginação para as respostas de listagem. */
export function buildPageMeta({ page, pageSize }, total) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
