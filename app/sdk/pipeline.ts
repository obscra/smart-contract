/**
 * OBSCRA Marketplace Pipeline — order management, settlement flow, and notifications.
 * Manages the complete lifecycle from purchase intent to decryption key delivery,
 * including escrow tracking, settlement events, and buyer/seller notifications.
 *
 * @packageDocumentation
 */

export type PipelineStatus =
  | "initiated"
  | "escrow_funded"
  | "key_exchange_pending"
  | "key_exchanged"
  | "settlement_complete"
  | "dispute_opened"
  | "refunded"
  | "cancelled";

export type NotificationType =
  | "purchase_initiated"
  | "escrow_funded"
  | "key_delivered"
  | "settlement_complete"
  | "dispute_opened"
  | "refund_issued"
  | "review_reminder"
  | "price_alert";

export type NotificationChannel = "onchain" | "wallet" | "email" | "webhook";

export interface PipelineOrder {
  id: string;
  listingId: number;
  buyer: string;
  seller: string;
  priceLamports: number;
  priceSol: number;
  status: PipelineStatus;
  escrowAddress: string;
  createdAt: string;
  updatedAt: string;
  keyExchangeTx?: string;
  settlementTx?: string;
  refundTx?: string;
  disputeDeadline: string;
  metadata: {
    fileName: string;
    fileSize: string;
    checksum: string;
    encryptedKeyHash: string;
    ipfsUri: string;
  };
  fees: {
    protocolFee: number;
    royaltyFee: number;
    sellerNet: number;
  };
  timeline: PipelineEvent[];
}

export interface PipelineEvent {
  status: PipelineStatus;
  timestamp: string;
  txSignature?: string;
  actor: "buyer" | "seller" | "protocol" | "arbitrator";
  message: string;
}

export interface MarketplaceNotification {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  recipient: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, string>;
}

export interface SettlementSummary {
  orderId: string;
  salePrice: number;
  protocolFee: number;
  royaltyFee: number;
  sellerNet: number;
  buyerTotal: number;
  settlementTx: string;
  timestamp: string;
}

export interface EscrowState {
  address: string;
  balance: number;
  owner: string;
  status: "locked" | "unlocked" | "settling";
  lockedAt?: string;
}

/**
 * Creates a new pipeline order from a purchase intent.
 */
export function createPipelineOrder(
  listingId: number,
  buyer: string,
  seller: string,
  priceSol: number,
  metadata: PipelineOrder["metadata"],
): PipelineOrder {
  const now = new Date().toISOString();
  const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const priceLamports = Math.floor(priceSol * 1_000_000_000);

  return {
    id: `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    listingId,
    buyer,
    seller,
    priceLamports,
    priceSol,
    status: "initiated",
    escrowAddress: `escrow_${listingId}_${buyer.slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
    disputeDeadline: deadline,
    metadata,
    fees: {
      protocolFee: Math.floor(priceLamports * 0.025),
      royaltyFee: 0,
      sellerNet: priceLamports * 0.975,
    },
    timeline: [
      {
        status: "initiated",
        timestamp: now,
        actor: "buyer",
        message: "Purchase initiated — escrow funding pending",
      },
    ],
  };
}

/**
 * Updates the pipeline order status and appends a timeline event.
 */
export function advancePipeline(
  order: PipelineOrder,
  newStatus: PipelineStatus,
  actor: PipelineEvent["actor"],
  message: string,
  txSignature?: string,
): PipelineOrder {
  const now = new Date().toISOString();
  return {
    ...order,
    status: newStatus,
    updatedAt: now,
    timeline: [
      ...order.timeline,
      { status: newStatus, timestamp: now, actor, message, txSignature },
    ],
  };
}

/**
 * Computes settlement fee breakdown for a pipeline order.
 */
export function computeSettlementFees(
  salePriceLamports: number,
  protocolFeeBps = 250,
  royaltyBps = 0,
): Omit<SettlementSummary, "orderId" | "settlementTx" | "timestamp"> {
  const protocolFee = Math.floor((salePriceLamports * protocolFeeBps) / 10_000);
  const royaltyFee = Math.floor((salePriceLamports * royaltyBps) / 10_000);
  const sellerNet = salePriceLamports - protocolFee - royaltyFee;
  return { salePrice: salePriceLamports, protocolFee, royaltyFee, sellerNet, buyerTotal: salePriceLamports };
}

/**
 * Checks whether a dispute can still be opened for an order.
 */
export function canOpenDispute(order: PipelineOrder): boolean {
  if (["dispute_opened", "refunded", "cancelled"].includes(order.status)) return false;
  return Date.now() < new Date(order.disputeDeadline).getTime();
}

/**
 * Generates a notification for a pipeline event.
 */
export function createPipelineNotification(
  type: NotificationType,
  recipient: string,
  order: PipelineOrder,
  additionalMessage?: string,
): MarketplaceNotification {
  const now = new Date().toISOString();
  const titles: Record<NotificationType, string> = {
    purchase_initiated: "Purchase Initiated",
    escrow_funded: "Escrow Funded",
    key_delivered: "Decryption Key Delivered",
    settlement_complete: "Settlement Complete",
    dispute_opened: "Dispute Opened",
    refund_issued: "Refund Issued",
    review_reminder: "Leave a Review",
    price_alert: "Price Alert",
  };
  const bodies: Record<NotificationType, string> = {
    purchase_initiated: `Your purchase of listing #${order.listingId} has been initiated.`,
    escrow_funded: `Escrow for listing #${order.listingId} has been funded.`,
    key_delivered: `Decryption key for listing #${order.listingId} has been delivered.`,
    settlement_complete: `Settlement for listing #${order.listingId} is complete. ${additionalMessage ?? ""}`,
    dispute_opened: `A dispute has been opened for listing #${order.listingId}.`,
    refund_issued: `A refund has been issued for listing #${order.listingId}.`,
    review_reminder: `Your purchase of listing #${order.listingId} is complete.`,
    price_alert: `Price drop alert for listing #${order.listingId}.`,
  };
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    channel: "wallet",
    recipient,
    title: titles[type],
    body: bodies[type],
    read: false,
    createdAt: now,
    metadata: { orderId: order.id, listingId: order.listingId.toString() },
  };
}

/**
 * Formats a pipeline status to a human-readable label with color hint.
 */
export function formatPipelineStatus(status: PipelineStatus): { label: string; color: string } {
  const map: Record<PipelineStatus, { label: string; color: string }> = {
    initiated:             { label: "Initiated",             color: "text-blue-400" },
    escrow_funded:          { label: "Escrow Funded",         color: "text-blue-400" },
    key_exchange_pending:   { label: "Key Exchange Pending",  color: "text-yellow-400" },
    key_exchanged:          { label: "Key Exchanged",         color: "text-yellow-400" },
    settlement_complete:    { label: "Settlement Complete",    color: "text-[#14F195]" },
    dispute_opened:         { label: "Dispute Opened",        color: "text-red-400" },
    refunded:              { label: "Refunded",               color: "text-white/50" },
    cancelled:             { label: "Cancelled",              color: "text-white/30" },
  };
  return map[status] ?? { label: status, color: "text-white/40" };
}

/**
 * Returns the escrow state for a given pipeline order.
 */
export function getEscrowState(order: PipelineOrder): EscrowState {
  const isLocked = ["initiated", "escrow_funded", "key_exchange_pending", "key_exchanged"].includes(order.status);
  const isSettling = order.status === "settlement_complete";
  return {
    address: order.escrowAddress,
    balance: isSettling ? 0 : order.priceLamports,
    owner: order.seller,
    status: isSettling ? "settling" : isLocked ? "locked" : "unlocked",
    lockedAt: isLocked ? order.createdAt : undefined,
  };
}

/**
 * Checks whether the dispute deadline has passed.
 */
export function isDisputeWindowClosed(disputeDeadline: string): boolean {
  return Date.now() > new Date(disputeDeadline).getTime();
}
