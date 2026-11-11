import { getPublicUrl } from '../services/storage.service.js';

export function toStockOverviewResponse(overview) {
  return {
    date: overview.date,
    lowStockThreshold: overview.lowStockThreshold,
    summary: overview.summary,
    items: overview.items.map((item) => ({
      cupcake: {
        id: item.cupcake.id,
        name: item.cupcake.name,
        flavor: item.cupcake.flavor,
        imageUrl: getPublicUrl(item.cupcake.imagePath),
        isActive: item.cupcake.isActive,
      },
      quantity: item.quantity,
      isSet: item.isSet,
      lowStock: item.lowStock,
      soldOut: item.soldOut,
      updatedAt: item.updatedAt,
    })),
  };
}
