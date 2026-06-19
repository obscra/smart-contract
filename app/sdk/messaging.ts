/**
 * OBSCRA Messaging — secure seller-buyer chat and communication system.
 * Provides encrypted direct messaging, conversation threads, message delivery
 * status, and marketplace-specific communication flows.
 *
 * @packageDocumentation
 */

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";
export type MessageType = "text" | "file" | "system" | "offer" | "inquiry";
export type ConversationStatus = "active" | "archived" | "blocked";

export interface Message {
  id: string;
  conversationId: string;
  sender: string;
  recipient: string;
  type: MessageType;
  content: string;
  encrypted: boolean;
  status: MessageStatus;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
  metadata?: Record<string, string>;
}

export interface Conversation {
  id: string;
  listingId?: number;
  listingTitle?: string;
  seller: string;
  buyer: string;
  status: ConversationStatus;
  lastMessage?: Message;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageOptions {
  type?: MessageType;
  encrypt?: boolean;
  listingId?: number;
}

export interface MessageThread {
  messages: Message[];
  participants: string[];
  hasMore: boolean;
  nextCursor?: string;
}

/** Maximum message length in characters. */
export const MAX_MESSAGE_LENGTH = 500;

/** Message status labels. */
export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  sending:   "Sending…",
  sent:      "Sent",
  delivered:"Delivered",
  read:     "Read",
  failed:   "Failed",
};

/** Message type labels. */
export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  text:    "Text",
  file:    "File",
  system:  "System",
  offer:   "Offer",
  inquiry: "Inquiry",
};

/** Pre-defined quick reply templates for marketplace conversations. */
export const QUICK_REPLY_TEMPLATES = [
  "Is the data still available?",
  "Can you provide a sample?",
  "What's the format of the dataset?",
  "Is there any documentation included?",
  "Can you share the data dictionary?",
  "What's the update frequency?",
  "Are there any usage restrictions?",
  "Is the price negotiable?",
];

/**
 * Creates a new conversation between buyer and seller.
 *
 * @param buyer - Buyer's public key.
 * @param seller - Seller's public key.
 * @param listingId - Optional associated listing ID.
 * @param listingTitle - Optional associated listing title.
 * @returns Conversation object.
 */
export function createConversation(
  buyer: string,
  seller: string,
  listingId?: number,
  listingTitle?: string,
): Conversation {
  const now = new Date().toISOString();
  const convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: convId,
    listingId,
    listingTitle,
    seller,
    buyer,
    status: "active",
    unreadCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates a new message within a conversation.
 *
 * @param conversationId - Conversation ID.
 * @param sender - Sender's public key.
 * @param recipient - Recipient's public key.
 * @param content - Message content.
 * @param options - Optional message options.
 * @returns Message object.
 */
export function createMessage(
  conversationId: string,
  sender: string,
  recipient: string,
  content: string,
  options?: SendMessageOptions,
): Message {
  const now = new Date().toISOString();
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: msgId,
    conversationId,
    sender,
    recipient,
    type: options?.type ?? "text",
    content,
    encrypted: options?.encrypt ?? true,
    status: "sending",
    createdAt: now,
    metadata: options?.listingId
      ? { listingId: options.listingId.toString() }
      : undefined,
  };
}

/**
 * Validates message content before sending.
 *
 * @param content - Message content.
 * @returns Validation result with errors if any.
 */
export function validateMessage(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    errors.push("Message cannot be empty");
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    errors.push(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
  }

  if (content.trim().length < 2) {
    errors.push("Message must be at least 2 characters");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Marks a message as delivered.
 *
 * @param message - Message to update.
 * @returns Updated message.
 */
export function markDelivered(message: Message): Message {
  return {
    ...message,
    status: "delivered",
    deliveredAt: new Date().toISOString(),
  };
}

/**
 * Marks a message as read.
 *
 * @param message - Message to update.
 * @returns Updated message.
 */
export function markRead(message: Message): Message {
  return {
    ...message,
    status: "read",
    readAt: new Date().toISOString(),
  };
}

/**
 * Marks a message as failed.
 *
 * @param message - Message to update.
 * @returns Updated message.
 */
export function markFailed(message: Message): Message {
  return {
    ...message,
    status: "failed",
  };
}

/**
 * Updates a conversation's last message and unread count.
 *
 * @param conversation - Conversation to update.
 * @param lastMessage - Latest message.
 * @param isRecipient - Whether the viewer is the recipient.
 * @returns Updated conversation.
 */
export function updateConversationLastMessage(
  conversation: Conversation,
  lastMessage: Message,
  isRecipient: boolean,
): Conversation {
  return {
    ...conversation,
    lastMessage,
    updatedAt: new Date().toISOString(),
    unreadCount: isRecipient
      ? conversation.unreadCount + 1
      : conversation.unreadCount,
  };
}

/**
 * Resets unread count for a conversation.
 *
 * @param conversation - Conversation to update.
 * @returns Updated conversation.
 */
export function resetUnreadCount(conversation: Conversation): Conversation {
  return {
    ...conversation,
    unreadCount: 0,
  };
}

/**
 * Archives a conversation.
 *
 * @param conversation - Conversation to archive.
 * @returns Updated conversation.
 */
export function archiveConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    status: "archived",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Blocks a conversation.
 *
 * @param conversation - Conversation to block.
 * @returns Updated conversation.
 */
export function blockConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    status: "blocked",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Generates a preview snippet from message content.
 *
 * @param content - Full message content.
 * @param maxLength - Maximum snippet length.
 * @returns Truncated preview string.
 */
export function messagePreview(content: string, maxLength = 60): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength - 3) + "…";
}

/**
 * Formats a timestamp as relative time (e.g., "2h ago", "yesterday").
 *
 * @param timestamp - ISO timestamp string.
 * @returns Human-readable relative time.
 */
export function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Suggests appropriate message type based on conversation context.
 *
 * @param listingId - Associated listing ID.
 * @param context - Conversation context.
 * @returns Suggested MessageType.
 */
export function suggestMessageType(
  listingId?: number,
  context?: string,
): MessageType {
  if (context?.toLowerCase().includes("offer")) return "offer";
  if (context?.toLowerCase().includes("sample") || context?.toLowerCase().includes("preview")) return "inquiry";
  return "text";
}
