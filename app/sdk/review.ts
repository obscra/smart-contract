/**
 * OBSCRA Review System — buyer feedback and seller rating aggregation.
 * Provides structured review submission, rating helpers, and trust score
 * computation after successful data purchases.
 *
 * @packageDocumentation
 */

/** Review rating in stars (1–5). */
export type StarRating = 1 | 2 | 3 | 4 | 5;

/** Review sentiment derived from star count. */
export type ReviewSentiment = "very_negative" | "negative" | "neutral" | "positive" | "very_positive";

/** Aggregated seller review summary. */
export interface SellerReviewSummary {
  seller: string;
  totalReviews: number;
  averageRating: number;
  sentiment: ReviewSentiment;
  stars: Record<StarRating, number>;
  recentComments: string[];
}

/** Individual review entry for display. */
export interface ReviewEntry {
  reviewer: string;
  target: string;
  order: string;
  rating: StarRating;
  comment: string;
  createdAt: string;
  sentiment: ReviewSentiment;
}

/** Payload for submitting a new review. */
export interface SubmitReviewPayload {
  listing: string;
  reviewer: string;
  rating: StarRating;
  comment: string;
}

/** Validation result from review preflight. */
export interface ReviewValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sentiment: ReviewSentiment;
  trustScoreImpact: number;
}

const RATING_LABELS: Record<StarRating, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Excellent",
};

/**
 * Derives a sentiment label from a star rating.
 *
 * @param rating - Star rating (1–5).
 * @returns ReviewSentiment label.
 */
export function ratingToSentiment(rating: StarRating): ReviewSentiment {
  if (rating <= 1) return "very_negative";
  if (rating === 2) return "negative";
  if (rating === 3) return "neutral";
  if (rating === 4) return "positive";
  return "very_positive";
}

/**
 * Formats a rating number to a star display string.
 *
 * @param rating - Numeric rating value.
 * @returns Unicode star string (e.g., "★★★★☆").
 */
export function formatStarDisplay(rating: number): string {
  const filled = Math.round(rating);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

/**
 * Computes the aggregate seller review summary from a list of review entries.
 *
 * @param reviews - Array of ReviewEntry objects.
 * @param sellerPubkey - The seller's public key string.
 * @returns SellerReviewSummary with averages and star distribution.
 */
export function computeSellerSummary(
  reviews: ReviewEntry[],
  sellerPubkey: string,
): SellerReviewSummary {
  const filtered = reviews.filter((r) => r.target === sellerPubkey);
  if (filtered.length === 0) {
    return {
      seller: sellerPubkey,
      totalReviews: 0,
      averageRating: 0,
      sentiment: "neutral",
      stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      recentComments: [],
    };
  }

  const sum = filtered.reduce((acc, r) => acc + r.rating, 0);
  const average = sum / filtered.length;
  const stars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<StarRating, number>;

  for (const r of filtered) {
    if (r.rating >= 1 && r.rating <= 5) {
      (stars as Record<number, number>)[r.rating]++;
    }
  }

  const avgFloor = Math.floor(average);
  const sentiment = ratingToSentiment((avgFloor || 1) as StarRating);

  const recentComments = filtered
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3)
    .map((r) => r.comment);

  return {
    seller: sellerPubkey,
    totalReviews: filtered.length,
    averageRating: Math.round(average * 10) / 10,
    sentiment,
    stars,
    recentComments,
  };
}

/**
 * Validates a review payload before submission.
 *
 * @param payload - SubmitReviewPayload to validate.
 * @returns ReviewValidationResult with errors, warnings, and sentiment.
 */
export function validateReview(payload: SubmitReviewPayload): ReviewValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload.listing) errors.push("Listing public key is required");
  if (!payload.reviewer) errors.push("Reviewer public key is required");

  if (payload.rating < 1 || payload.rating > 5) {
    errors.push(`Rating must be between 1 and 5, got ${payload.rating}`);
  }

  if (!payload.comment || payload.comment.trim().length === 0) {
    errors.push("Comment must not be empty");
  }

  if (payload.comment && payload.comment.length > 280) {
    errors.push("Comment exceeds maximum length of 280 characters");
  }

  if (payload.comment && payload.comment.length < 10) {
    warnings.push("Short comments may appear low-effort; consider adding more detail");
  }

  const valid = errors.length === 0;
  const sentiment = valid ? ratingToSentiment(payload.rating) : "neutral";

  // Trust score impact: +0.1 per star above 3, -0.05 per star below 3
  const trustScoreImpact = valid
    ? Math.round(((payload.rating - 3) * 0.1) * 1000) / 1000
    : 0;

  return { valid, errors, warnings, sentiment, trustScoreImpact };
}

/**
 * Checks whether a buyer is eligible to submit a review.
 *
 * @param purchaseStatus - The status of the purchase (e.g., "Sold", "Active").
 * @returns true if eligible.
 */
export function isReviewEligible(purchaseStatus: string): boolean {
  return purchaseStatus === "Sold";
}

/**
 * Returns the display label for a given star rating.
 *
 * @param rating - Star rating (1–5).
 * @returns Human-readable label.
 */
export function ratingLabel(rating: StarRating): string {
  return RATING_LABELS[rating];
}
