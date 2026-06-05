export type GuardSeverity = "low" | "medium" | "high";

export interface FileGuardFinding {
  code: string;
  severity: GuardSeverity;
  message: string;
}

export interface FileGuardOptions {
  maxBytes?: number;
  allowedMimeTypes?: string[];
  blockedExtensions?: string[];
  scanTextPayloads?: boolean;
}

export interface FileGuardInput {
  name: string;
  mimeType?: string;
  size: number;
  bytes: Uint8Array;
}

export interface FileGuardResult {
  accepted: boolean;
  checksum: string;
  findings: FileGuardFinding[];
}

export const UPLOAD_LIMIT_GIB = 2;
export const DEFAULT_MAX_BYTES = UPLOAD_LIMIT_GIB * 1024 * 1024 * 1024;

const DEFAULT_UPLOAD_POLICY_LABEL = `${UPLOAD_LIMIT_GIB} GiB encrypted object envelope`;

const DEFAULT_BLOCKED_EXTENSIONS = [
  ".app",
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".dmg",
  ".exe",
  ".hta",
  ".jar",
  ".js",
  ".msi",
  ".ps1",
  ".scr",
  ".sh",
  ".vbs",
  ".wsf",
];

const EXECUTABLE_SIGNATURES: Array<{
  code: string;
  signature: number[];
  description: string;
}> = [
  {
    code: "mz_executable",
    signature: [0x4d, 0x5a],
    description: "Windows executable header",
  },
  {
    code: "elf_binary",
    signature: [0x7f, 0x45, 0x4c, 0x46],
    description: "ELF binary header",
  },
  {
    code: "mach_o_binary",
    signature: [0xcf, 0xfa, 0xed, 0xfe],
    description: "Mach-O binary header",
  },
  {
    code: "mach_o_binary",
    signature: [0xfe, 0xed, 0xfa, 0xcf],
    description: "Mach-O binary header",
  },
  {
    code: "zip_archive",
    signature: [0x50, 0x4b, 0x03, 0x04],
    description: "ZIP/JAR archive header",
  },
];

const SUSPICIOUS_TEXT_PATTERNS: Array<{
  code: string;
  pattern: RegExp;
  label: string;
}> = [
  {
    code: "powershell_payload",
    pattern: /powershell\s+(-enc|-encodedcommand|-nop)/i,
    label: "PowerShell launcher",
  },
  {
    code: "shell_download_exec",
    pattern: /(curl|wget)\s+.+(\||;)\s*(sh|bash|python|perl)/i,
    label: "download-and-execute shell pattern",
  },
  {
    code: "html_script_payload",
    pattern: /<script[\s>][\s\S]{0,400}(eval|atob|document\.write)/i,
    label: "obfuscated browser script",
  },
  {
    code: "macro_autoexec",
    pattern: /\b(auto_open|document_open|wscript\.shell)\b/i,
    label: "macro auto-execution marker",
  },
];

export async function guardUploadedFile(
  input: FileGuardInput,
  options: FileGuardOptions = {},
): Promise<FileGuardResult> {
  const findings: FileGuardFinding[] = [];
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const blockedExtensions =
    options.blockedExtensions ?? DEFAULT_BLOCKED_EXTENSIONS;
  const normalizedName = input.name.toLowerCase();
  const checksum = await sha256Hex(input.bytes);

  if (input.size <= 0 || input.bytes.length <= 0) {
    findings.push({
      code: "empty_file",
      severity: "high",
      message: "Upload rejected because the file is empty.",
    });
  }

  if (input.size > maxBytes || input.bytes.length > maxBytes) {
    findings.push({
      code: "file_too_large",
      severity: "high",
      message: `Upload rejected because the file exceeds the active ${formatBytes(maxBytes)} upload envelope.`,
    });
  }

  const blockedExtension = blockedExtensions.find((extension) =>
    normalizedName.endsWith(extension),
  );
  if (blockedExtension) {
    findings.push({
      code: "blocked_extension",
      severity: "high",
      message: `Upload rejected because ${blockedExtension} files are not accepted.`,
    });
  }

  if (options.allowedMimeTypes?.length && input.mimeType) {
    const normalizedMime = input.mimeType.toLowerCase();
    if (
      !options.allowedMimeTypes
        .map((mime) => mime.toLowerCase())
        .includes(normalizedMime)
    ) {
      findings.push({
        code: "mime_not_allowed",
        severity: "medium",
        message: `Upload MIME type ${input.mimeType} is outside the configured allowlist.`,
      });
    }
  }

  for (const item of EXECUTABLE_SIGNATURES) {
    if (hasPrefix(input.bytes, item.signature)) {
      findings.push({
        code: item.code,
        severity: item.code === "zip_archive" ? "medium" : "high",
        message: `Upload matched a ${item.description}.`,
      });
    }
  }

  if (options.scanTextPayloads ?? true) {
    const textWindow = decodeTextWindow(input.bytes);
    for (const item of SUSPICIOUS_TEXT_PATTERNS) {
      if (item.pattern.test(textWindow)) {
        findings.push({
          code: item.code,
          severity: "high",
          message: `Upload contains a suspicious ${item.label}.`,
        });
      }
    }
  }

  if (
    input.bytes.length >= 4096 &&
    shannonEntropy(input.bytes.slice(0, 4096)) > 7.85
  ) {
    findings.push({
      code: "high_entropy_payload",
      severity: "low",
      message: "Upload has unusually high entropy in its header window.",
    });
  }

  if (!findings.length && maxBytes === DEFAULT_MAX_BYTES) {
    findings.push({
      code: "large_object_tier_2gb",
      severity: "low",
      message: `Upload preflight passed under the ${DEFAULT_UPLOAD_POLICY_LABEL} policy.`,
    });
  }

  return {
    accepted: !findings.some((finding) => finding.severity === "high"),
    checksum,
    findings,
  };
}

function formatBytes(bytes: number): string {
  const gib = bytes / (1024 * 1024 * 1024);
  if (gib >= 1) {
    return `${Number.isInteger(gib) ? gib : gib.toFixed(2)} GiB`;
  }
  const mib = bytes / (1024 * 1024);
  return `${Number.isInteger(mib) ? mib : mib.toFixed(2)} MiB`;
}

function hasPrefix(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }

  return signature.every((byte, index) => bytes[index] === byte);
}

function decodeTextWindow(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.slice(0, 64 * 1024),
  );
}

function shannonEntropy(bytes: Uint8Array): number {
  const counts = new Array<number>(256).fill(0);
  for (const byte of bytes) {
    counts[byte] += 1;
  }

  return counts.reduce((entropy, count) => {
    if (count === 0) {
      return entropy;
    }
    const probability = count / bytes.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const cryptoApi = globalThis.crypto?.subtle;
  if (!cryptoApi) {
    return fallbackHash(bytes);
  }

  const digest = await cryptoApi.digest("SHA-256", toArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function fallbackHash(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
