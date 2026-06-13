/**
 * OBSCRA Blur Preview — encrypted data preview protection layer.
 * Applies configurable CSS-style blur filters to marketplace listing thumbnails
 * based on content classification, trust tier, and buyer access level.
 *
 * @packageDocumentation
 */

export type BlurIntensity = "none" | "light" | "medium" | "heavy";

export interface BlurPreviewOptions {
  /** Blur intensity level. Defaults to "medium". */
  intensity?: BlurIntensity;
  /** Whether to apply a gradient overlay. Defaults to true. */
  gradientOverlay?: boolean;
  /** Custom CSS brightness multiplier. Defaults based on intensity. */
  brightnessMultiplier?: number;
  /** Whether to lock blur until unlock token is provided. */
  gatedUnlock?: boolean;
}

export interface BlurPreviewResult {
  intensity: BlurIntensity;
  blurRadiusPx: number;
  brightness: number;
  overlayOpacity: number;
  cssFilter: string;
  gatedUnlock: boolean;
  unlockCondition: string;
}

const BLUR_MAP: Record<BlurIntensity, { radius: number; brightness: number; overlay: number }> = {
  none:   { radius: 0,    brightness: 1.0,  overlay: 0 },
  light:  { radius: 12,   brightness: 0.7,  overlay: 0.3 },
  medium: { radius: 32,   brightness: 0.5,  overlay: 0.5 },
  heavy:  { radius: 48,   brightness: 0.35, overlay: 0.7 },
};

const TRUST_TIER_BLUR: Record<string, BlurIntensity> = {
  anonymous:  "heavy",
  new_user:   "medium",
  verified:   "light",
  trusted:    "none",
};

const CONTENT_CLASS_BLUR: Record<string, BlurIntensity> = {
  "market-dataset":    "heavy",
  "model-artifact":    "medium",
  "media-asset":       "light",
  "structured-data":   "medium",
  "encrypted-object":  "heavy",
};

function cssFilter(radius: number, brightness: number): string {
  return `blur(${radius}px) brightness(${brightness})`;
}

/**
 * Resolves the appropriate blur intensity for a listing preview.
 * Considers content classification, buyer trust tier, and explicit options.
 *
 * @param contentClass - The content class from FileMetadataDescriptor.
 * @param trustTier - The buyer's trust tier (anonymous, new_user, verified, trusted).
 * @param options - Override options.
 * @returns BlurPreviewResult with computed CSS filter and metadata.
 */
export function computeBlurPreview(
  contentClass: string,
  trustTier: keyof typeof TRUST_TIER_BLUR = "anonymous",
  options: BlurPreviewOptions = {},
): BlurPreviewResult {
  const {
    intensity,
    gradientOverlay = true,
    brightnessMultiplier,
    gatedUnlock = false,
  } = options;

  const resolved: BlurIntensity =
    intensity ??
    CONTENT_CLASS_BLUR[contentClass] ??
    TRUST_TIER_BLUR[trustTier] ??
    "medium";

  const { radius, brightness: baseBrightness, overlay } = BLUR_MAP[resolved];
  const brightness = brightnessMultiplier ?? baseBrightness;

  const unlockCondition = gatedUnlock
    ? `Unlock requires ${trustTier === "trusted" ? "trusted-tier token" : "verified buyer status + SOL payment"}`
    : "Public preview — no unlock required";

  return {
    intensity: resolved,
    blurRadiusPx: radius,
    brightness,
    overlayOpacity: gradientOverlay ? overlay : 0,
    cssFilter: cssFilter(radius, brightness),
    gatedUnlock,
    unlockCondition,
  };
}

/**
 * Generates a CSS-compatible inline style string for blur preview.
 *
 * @param result - BlurPreviewResult from computeBlurPreview.
 * @returns CSS style string for use in HTML element style attribute.
 */
export function blurPreviewStyle(result: BlurPreviewResult): string {
  const { cssFilter, overlayOpacity } = result;
  return `filter: ${cssFilter}; position: relative; overflow: hidden;` +
    (overlayOpacity > 0 ? ` --overlay-opacity: ${overlayOpacity};` : "");
}

/**
 * Returns the default blur level for a given content class.
 *
 * @param contentClass - The content class string.
 * @returns BlurIntensity level.
 */
export function defaultBlurForClass(contentClass: string): BlurIntensity {
  return CONTENT_CLASS_BLUR[contentClass] ?? "medium";
}

/**
 * Determines if a buyer can unlock a specific blur level.
 *
 * @param currentTier - Buyer's current trust tier.
 * @param requiredTier - Minimum required trust tier to unlock.
 * @returns true if the buyer can unlock.
 */
export function canUnlockBlur(
  currentTier: keyof typeof TRUST_TIER_BLUR,
  requiredTier: keyof typeof TRUST_TIER_BLUR,
): boolean {
  const tierOrder: Array<keyof typeof TRUST_TIER_BLUR> = [
    "anonymous", "new_user", "verified", "trusted",
  ];
  return tierOrder.indexOf(currentTier) >= tierOrder.indexOf(requiredTier);
}
