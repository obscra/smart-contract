/**
 * OBSCRA Encryption Security — AES-256-GCM encryption with key derivation, 
 * secure key exchange, and multi-layer encryption envelope.
 * Provides client-side encryption helpers, key management, and envelope
 * construction for encrypted data assets.
 *
 * @packageDocumentation
 */

export type EncryptionAlgorithm = "AES-256-GCM" | "AES-256-CBC" | "ChaCha20-Poly1305";
export type KeyDerivationFunction = "PBKDF2" | "Argon2id" | "HKDF-SHA256";
export type KeyExchangeMethod = "ecdh" | "rsa-4096" | "x25519";

export interface EncryptionKey {
  id: string;
  algorithm: EncryptionAlgorithm;
  keyBytes: Uint8Array;
  ivBytes: Uint8Array;
  authTagBytes?: Uint8Array;
  createdAt: string;
  expiresAt?: string;
}

export interface EncryptionEnvelope {
  version: string;
  algorithm: EncryptionAlgorithm;
  kdf: KeyDerivationFunction;
  keyExchange: KeyExchangeMethod;
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
  checksum: string;
  chunksTotal: number;
  chunkSizeBytes: number;
  metadataHash: string;
  sealedAt: string;
}

export interface KeyDerivationOptions {
  /** Key derivation function. Defaults to "Argon2id". */
  kdf?: KeyDerivationFunction;
  /** Salt for KDF in hex. Defaults to random 32 bytes. */
  salt?: string;
  /** Number of iterations for PBKDF2. Defaults to 100000. */
  iterations?: number;
  /** Memory cost in MB for Argon2id. Defaults to 64 MB. */
  memoryCostMb?: number;
  /** Parallelism factor. Defaults to 4. */
  parallelism?: number;
  /** Key length in bytes. Defaults to 32. */
  keyLength?: number;
}

export interface EncryptedPayload {
  envelope: EncryptionEnvelope;
  key: EncryptionKey;
  plaintextChecksum: string;
  ciphertextChecksum: string;
  compressed: boolean;
  compressionAlgorithm?: "zstd" | "gzip";
}

export interface DecryptionVerification {
  verified: boolean;
  authTagValid: boolean;
  checksumValid: boolean;
  metadataHashValid: boolean;
  errors: string[];
}

/** Current encryption envelope version. */
export const ENCRYPTION_VERSION = "obscra.enc.v3";

/** Supported encryption algorithms. */
export const SUPPORTED_ALGORITHMS: EncryptionAlgorithm[] = [
  "AES-256-GCM",
  "AES-256-CBC",
  "ChaCha20-Poly1305",
];

/** Default encryption algorithm. */
export const DEFAULT_ALGORITHM: EncryptionAlgorithm = "AES-256-GCM";

/** Default KDF. */
export const DEFAULT_KDF: KeyDerivationFunction = "Argon2id";

/** Default key exchange method. */
export const DEFAULT_KEY_EXCHANGE: KeyExchangeMethod = "x25519";

/** AES-GCM auth tag length in bytes. */
export const AUTH_TAG_LENGTH = 16;

/** IV length for AES-256 in bytes. */
export const IV_LENGTH = 12;

/** Salt length for KDF in bytes. */
export const SALT_LENGTH = 32;

/** Default chunk size for encrypted chunks (16 MiB). */
export const DEFAULT_CHUNK_SIZE = 16 * 1024 * 1024;

/**
 * Generates a random encryption key with IV for AES-256-GCM.
 *
 * @param algorithm - Encryption algorithm to use.
 * @returns EncryptionKey object.
 */
export function generateEncryptionKey(algorithm: EncryptionAlgorithm = DEFAULT_ALGORITHM): EncryptionKey {
  const now = new Date().toISOString();
  const keyId = `key_${Date.now()}_${randomHex(8)}`;
  
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const ivBytes = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  return {
    id: keyId,
    algorithm,
    keyBytes,
    ivBytes,
    authTagBytes: algorithm === "AES-256-GCM" ? crypto.getRandomValues(new Uint8Array(AUTH_TAG_LENGTH)) : undefined,
    createdAt: now,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Generates a random hex string.
 *
 * @param length - Length of the hex string.
 * @returns Hex string.
 */
export function randomHex(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

/**
 * Constructs an encryption envelope with all security metadata.
 *
 * @param algorithm - Encryption algorithm used.
 * @param kdf - Key derivation function used.
 * @param keyExchange - Key exchange method used.
 * @param salt - KDF salt in hex.
 * @param iv - IV in hex.
 * @param ciphertext - Encrypted ciphertext in base64.
 * @param authTag - Authentication tag in hex.
 * @param plaintextChecksum - SHA-256 of original plaintext.
 * @param chunksTotal - Total number of encrypted chunks.
 * @param chunkSizeBytes - Size of each chunk.
 * @param metadataHash - Hash of encrypted metadata.
 * @returns EncryptionEnvelope object.
 */
export function buildEncryptionEnvelope(
  algorithm: EncryptionAlgorithm,
  kdf: KeyDerivationFunction,
  keyExchange: KeyExchangeMethod,
  salt: string,
  iv: string,
  ciphertext: string,
  authTag: string,
  plaintextChecksum: string,
  chunksTotal: number,
  chunkSizeBytes: number,
  metadataHash: string,
): EncryptionEnvelope {
  return {
    version: ENCRYPTION_VERSION,
    algorithm,
    kdf,
    keyExchange,
    salt,
    iv,
    ciphertext,
    authTag,
    checksum: plaintextChecksum,
    chunksTotal,
    chunkSizeBytes,
    metadataHash,
    sealedAt: new Date().toISOString(),
  };
}

/**
 * Verifies the integrity and authenticity of a decryption operation.
 *
 * @param envelope - EncryptionEnvelope to verify.
 * @param computedAuthTag - Computed auth tag from decryption.
 * @param computedChecksum - Computed checksum of decrypted plaintext.
 * @param computedMetadataHash - Computed metadata hash.
 * @returns DecryptionVerification result.
 */
export function verifyDecryption(
  envelope: EncryptionEnvelope,
  computedAuthTag: string,
  computedChecksum: string,
  computedMetadataHash: string,
): DecryptionVerification {
  const errors: string[] = [];

  const authTagValid = computedAuthTag.toLowerCase() === envelope.authTag.toLowerCase();
  if (!authTagValid) errors.push("Authentication tag mismatch — ciphertext may have been tampered with");

  const checksumValid = computedChecksum.toLowerCase() === envelope.checksum.toLowerCase();
  if (!checksumValid) errors.push("Plaintext checksum mismatch — data integrity compromised");

  const metadataHashValid = computedMetadataHash.toLowerCase() === envelope.metadataHash.toLowerCase();
  if (!metadataHashValid) errors.push("Metadata hash mismatch — envelope integrity failed");

  const verified = authTagValid && checksumValid && metadataHashValid;

  return {
    verified,
    authTagValid,
    checksumValid,
    metadataHashValid,
    errors,
  };
}

/**
 * Computes KDF options with safe defaults.
 *
 * @param options - Override options.
 * @returns Complete KeyDerivationOptions.
 */
export function defaultKdfOptions(options?: KeyDerivationOptions): KeyDerivationOptions {
  return {
    kdf: options?.kdf ?? DEFAULT_KDF,
    salt: options?.salt ?? randomHex(SALT_LENGTH),
    iterations: options?.iterations ?? 100_000,
    memoryCostMb: options?.memoryCostMb ?? 64,
    parallelism: options?.parallelism ?? 4,
    keyLength: options?.keyLength ?? 32,
  };
}

/**
 * Returns the security strength description for an algorithm.
 *
 * @param algorithm - Encryption algorithm.
 * @returns Security strength label.
 */
export function getAlgorithmStrength(algorithm: EncryptionAlgorithm): string {
  switch (algorithm) {
    case "AES-256-GCM":
      return "256-bit authenticated encryption (IND-CPA + INT-CTXT secure)";
    case "AES-256-CBC":
      return "256-bit encryption (IND-CPA secure, requires HMAC for authentication)";
    case "ChaCha20-Poly1305":
      return "256-bit authenticated encryption (抵抗缓存时序攻击)";
  }
}

/**
 * Computes the number of chunks for a given file size.
 *
 * @param fileSizeBytes - Total file size in bytes.
 * @param chunkSizeBytes - Chunk size in bytes.
 * @returns Number of chunks.
 */
export function computeChunkCount(fileSizeBytes: number, chunkSizeBytes = DEFAULT_CHUNK_SIZE): number {
  return Math.max(1, Math.ceil(fileSizeBytes / chunkSizeBytes));
}

/**
 * Validates that an encryption envelope version is supported.
 *
 * @param version - Envelope version string.
 * @returns true if version is supported.
 */
export function isVersionSupported(version: string): boolean {
  const supported = [ENCRYPTION_VERSION, "obscra.enc.v2", "obscra.enc.v1"];
  return supported.includes(version);
}
