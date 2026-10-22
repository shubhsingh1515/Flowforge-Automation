import dns from "node:dns/promises";
import net from "node:net";

export class SsrkViolationError extends Error {
  code = "SSRF_VIOLATION";
  constructor(message: string) {
    super(message);
    this.name = "SsrkViolationError";
  }
}

/**
 * Checks whether an IP address falls into restricted / private / loopback / metadata ranges.
 */
export function isPrivateOrRestrictedIp(ip: string): boolean {
  if (!net.isIP(ip)) {
    return true; // Invalid IP is treated as restricted
  }

  // IPv4 Checks
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    const [a, b, c, d] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;

    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;

    // 10.0.0.0/8 (Private)
    if (a === 10) return true;

    // 172.16.0.0/12 (Private: 172.16.x.x - 172.31.x.x)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return true;

    // 169.254.0.0/16 (Link-Local & Cloud Metadata: AWS/GCP/Azure 169.254.169.254)
    if (a === 169 && b === 254) return true;

    // 100.64.0.0/10 (Carrier Grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;

    // 198.18.0.0/15 (Network benchmark tests)
    if (a === 198 && (b === 18 || b === 19)) return true;

    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (a >= 224) return true;

    // Broadcast
    if (a === 255 && b === 255 && c === 255 && d === 255) return true;

    return false;
  }

  // IPv6 Checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // Loopback
    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
    // Unspecified
    if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;
    // IPv6 link-local (fe80::/10)
    if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
      return true;
    }
    // IPv6 unique local (fc00::/7)
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return true;
    }
    // IPv4-mapped IPv6 (::ffff:127.0.0.1, etc.)
    if (normalized.includes("::ffff:")) {
      const ipv4Part = normalized.split("::ffff:")[1];
      if (ipv4Part && net.isIPv4(ipv4Part)) {
        return isPrivateOrRestrictedIp(ipv4Part);
      }
    }
    return false;
  }

  return true;
}

export interface ValidateUrlOptions {
  allowLocalhostForTesting?: boolean;
}

/**
 * Validates a target URL against SSRF threats:
 * 1. Restricts protocols to HTTP / HTTPS only.
 * 2. Resolves DNS hostname to IP address.
 * 3. Enforces IP range restrictions (blocks loopback, private RFC1918, cloud metadata).
 */
export async function validateUrlForSsrf(
  urlString: string,
  options: ValidateUrlOptions = {}
): Promise<{ url: URL; resolvedIp: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    throw new SsrkViolationError(`Invalid URL format: "${urlString}"`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new SsrkViolationError(
      `Protocol "${parsedUrl.protocol}" is not permitted. Only http: and https: are allowed.`
    );
  }

  const hostname = parsedUrl.hostname;

  // Check if testing override is active
  const allowLocal =
    options.allowLocalhostForTesting ||
    process.env.ALLOW_LOCAL_TEST_REQUESTS === "true";

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    if (allowLocal) {
      return { url: parsedUrl, resolvedIp: "127.0.0.1" };
    }
    throw new SsrkViolationError("Access to localhost is blocked by security policy.");
  }

  // Resolve hostname via DNS
  let addresses: string[] = [];
  try {
    if (net.isIP(hostname)) {
      addresses = [hostname];
    } else {
      const lookupResult = await dns.lookup(hostname, { all: true });
      addresses = lookupResult.map((r) => r.address);
    }
  } catch (err: any) {
    throw new SsrkViolationError(`Failed to resolve DNS hostname "${hostname}": ${err.message}`);
  }

  if (addresses.length === 0) {
    throw new SsrkViolationError(`No IP addresses found for hostname "${hostname}".`);
  }

  for (const ip of addresses) {
    if (isPrivateOrRestrictedIp(ip)) {
      if (allowLocal && (ip === "127.0.0.1" || ip === "::1")) {
        continue;
      }
      throw new SsrkViolationError(
        `Target IP ${ip} resolved from hostname "${hostname}" is in a private, loopback, or cloud-metadata network range.`
      );
    }
  }

  return { url: parsedUrl, resolvedIp: addresses[0] };
}

/**
 * Convenience helper returning a boolean safe flag and reason if unsafe.
 */
export async function isUrlSafeFromSsrf(
  urlString: string,
  options: ValidateUrlOptions = {}
): Promise<{ safe: boolean; reason?: string }> {
  try {
    await validateUrlForSsrf(urlString, options);
    return { safe: true };
  } catch (err: any) {
    return { safe: false, reason: err.message };
  }
}
