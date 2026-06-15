/**
 * OBSCRA Marketplace System — listing management, filtering, and analytics.
 * Provides structured listing types, category management, price filtering,
 * wishlist helpers, and marketplace statistics.
 *
 * @packageDocumentation
 */

export type ListingCategory =
  | "market-data"
  | "ml-models"
  | "signals"
  | "research"
  | "api-access";

export type SortOption = "newest" | "price_asc" | "price_desc" | "rating_desc" | "popular";

export interface MarketplaceListing {
  id: number;
  title: string;
  description: string;
  category: ListingCategory;
  price: number;
  seller: string;
  status: string;
  tags: string[];
  preview: string;
  views: number;
  sales: number;
  createdAt: string;
  expiresAt?: string;
  metadata: {
    file: string;
    size: string;
    type: string;
    checksum: string;
    chunks: number;
    encrypted: string;
  };
  ai?: {
    confidence: string;
    summary: string;
  };
  sellerRating?: {
    avg: number;
    count: number;
  };
}

export interface MarketplaceFilters {
  category?: ListingCategory | "all";
  priceMin?: number;
  priceMax?: number;
  sort?: SortOption;
  search?: string;
  tags?: string[];
  sellerVerified?: boolean;
}

export interface MarketplaceStats {
  totalListings: number;
  totalVolume: number;
  avgPrice: number;
  topCategory: ListingCategory;
  activeSellers: number;
  totalSales: number;
}

export interface WishlistEntry {
  listingId: number;
  addedAt: string;
  notifyPriceDrop: boolean;
  targetPrice?: number;
}

export interface CompareEntry {
  listings: MarketplaceListing[];
  comparedFields: Array<keyof MarketplaceListing>;
}

/** Default marketplace categories with metadata. */
export const MARKETPLACE_CATEGORIES: Record<
  ListingCategory,
  { label: string; icon: string; description: string }
> = {
  "market-data": {
    label: "Market Data",
    icon: "📊",
    description: "OHLCV, orderbook snapshots, funding rates, and trade feeds",
  },
  "ml-models": {
    label: "ML Models",
    icon: "🧠",
    description: "Trained model weights, fine-tuning datasets, and inference configs",
  },
  signals: {
    label: "Signals",
    icon: "🚦",
    description: "Alpha indicators, whale alerts, MEV data, and trading signals",
  },
  research: {
    label: "Research",
    icon: "📄",
    description: "Proprietary reports, Due diligence packs, and protocol analysis",
  },
  "api-access": {
    label: "API Access",
    icon: "🔑",
    description: "Premium API keys, WebSocket feeds, and access tokens",
  },
};

/** Maximum listings per page for pagination. */
export const LISTINGS_PER_PAGE = 20;

/**
 * Filters a list of marketplace listings based on provided filters.
 *
 * @param listings - Array of MarketplaceListing objects.
 * @param filters - MarketplaceFilters to apply.
 * @returns Filtered and sorted array of listings.
 */
export function filterListings(
  listings: MarketplaceListing[],
  filters: MarketplaceFilters,
): MarketplaceListing[] {
  let result = [...listings];

  if (filters.category && filters.category !== "all") {
    result = result.filter((l) => l.category === filters.category);
  }

  if (filters.priceMin !== undefined) {
    result = result.filter((l) => l.price >= filters.priceMin!);
  }

  if (filters.priceMax !== undefined) {
    result = result.filter((l) => l.price <= filters.priceMax!);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  if (filters.tags?.length) {
    result = result.filter((l) =>
      filters.tags!.some((tag) => l.tags.includes(tag)),
    );
  }

  if (filters.sort) {
    switch (filters.sort) {
      case "newest":
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "price_asc":
        result.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        result.sort((a, b) => b.price - a.price);
        break;
      case "rating_desc":
        result.sort((a, b) => (b.sellerRating?.avg ?? 0) - (a.sellerRating?.avg ?? 0));
        break;
      case "popular":
        result.sort((a, b) => b.sales - a.sales);
        break;
    }
  }

  return result;
}

/**
 * Computes aggregated marketplace statistics.
 *
 * @param listings - Array of MarketplaceListing objects.
 * @returns MarketplaceStats with aggregated data.
 */
export function computeMarketplaceStats(
  listings: MarketplaceListing[],
): MarketplaceStats {
  if (listings.length === 0) {
    return {
      totalListings: 0,
      totalVolume: 0,
      avgPrice: 0,
      topCategory: "market-data",
      activeSellers: 0,
      totalSales: 0,
    };
  }

  const activeListings = listings.filter((l) => l.status === "active");
  const totalVolume = listings.reduce((sum, l) => sum + l.price * l.sales, 0);
  const avgPrice =
    activeListings.reduce((sum, l) => sum + l.price, 0) /
    (activeListings.length || 1);

  const categoryCounts: Record<string, number> = {};
  for (const l of activeListings) {
    categoryCounts[l.category] = (categoryCounts[l.category] ?? 0) + 1;
  }
  const topCategory = (Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "market-data") as ListingCategory;

  const uniqueSellers = new Set(listings.map((l) => l.seller));
  const totalSales = listings.reduce((sum, l) => sum + l.sales, 0);

  return {
    totalListings: activeListings.length,
    totalVolume,
    avgPrice: Math.round(avgPrice * 100) / 100,
    topCategory,
    activeSellers: uniqueSellers.size,
    totalSales,
  };
}

/**
 * Adds or removes a listing from the wishlist.
 *
 * @param wishlist - Current wishlist.
 * @param listingId - Listing ID to toggle.
 * @param notifyPriceDrop - Whether to notify on price drop.
 * @param targetPrice - Target price for notifications.
 * @returns Updated wishlist.
 */
export function toggleWishlist(
  wishlist: WishlistEntry[],
  listingId: number,
  notifyPriceDrop = false,
  targetPrice?: number,
): WishlistEntry[] {
  const existing = wishlist.find((w) => w.listingId === listingId);
  if (existing) {
    return wishlist.filter((w) => w.listingId !== listingId);
  }
  return [
    ...wishlist,
    {
      listingId,
      addedAt: new Date().toISOString(),
      notifyPriceDrop,
      targetPrice,
    },
  ];
}

/**
 * Checks whether a listing is in the wishlist.
 *
 * @param wishlist - Current wishlist.
 * @param listingId - Listing ID to check.
 * @returns true if in wishlist.
 */
export function isInWishlist(
  wishlist: WishlistEntry[],
  listingId: number,
): boolean {
  return wishlist.some((w) => w.listingId === listingId);
}

/**
 * Formats a price in SOL with USD conversion.
 *
 * @param solPrice - Price in SOL.
 * @param solToUsdRate - SOL to USD exchange rate.
 * @returns Formatted price object.
 */
export function formatPrice(
  solPrice: number,
  solToUsdRate = 165,
): { sol: string; usd: string } {
  return {
    sol: `${solPrice.toFixed(2)} SOL`,
    usd: `≈ $${(solPrice * solToUsdRate).toFixed(0)} USD`,
  };
}

/**
 * Returns a truncated listing ID string for display.
 *
 * @param id - Numeric listing ID.
 * @returns Formatted ID string.
 */
export function formatListingId(id: number): string {
  return `#${id.toString().padStart(4, "0")}`;
}
