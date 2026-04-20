import { isIP } from "node:net";

/**
 * SSRF CIDR guard. Returns `true` when `ip` must NOT be contacted by the
 * service proxy — i.e. it sits in a private, loopback, link-local, metadata,
 * or otherwise-reserved range. Fail-closed: unparseable input is treated as
 * blocked.
 *
 * Blocked IPv4 ranges (spec #48):
 *   0.0.0.0/8         — "this network"
 *   10.0.0.0/8        — private
 *   127.0.0.0/8       — loopback
 *   169.254.0.0/16    — link-local (includes 169.254.169.254 metadata)
 *   172.16.0.0/12     — private
 *   192.168.0.0/16    — private
 *   224.0.0.0/4       — multicast
 *   240.0.0.0/4       — reserved
 *
 * Blocked IPv6:
 *   ::/128, ::1/128   — unspecified, loopback
 *   fc00::/7          — unique-local
 *   fe80::/10         — link-local
 *   ::ffff:0:0/96     — IPv4-mapped (recursively checked against IPv4 rules)
 */
export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIPv4(ip);
  if (kind === 6) return isBlockedIPv6(ip);
  return true;
}

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return true;
  const octets = parts.map((p) => Number(p));
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return true;
  const [a, b] = octets as [number, number, number, number];

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (includes metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 (multicast)
  if (a >= 240) return true; // 240.0.0.0/4 (reserved) + 255.255.255.255
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const lc = ip.toLowerCase();

  if (lc === "::" || lc === "::1") return true;

  // IPv4-mapped: ::ffff:a.b.c.d
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lc);
  if (mapped) return isBlockedIPv4(mapped[1] as string);

  // Expand to first hextet for prefix classification.
  const firstHextet = expandFirstHextet(lc);
  if (firstHextet === null) return true;

  // fe80::/10 → first 10 bits are 1111 1110 10 → 0xfe80..0xfebf
  if ((firstHextet & 0xffc0) === 0xfe80) return true;
  // fc00::/7 → first 7 bits are 1111 110 → 0xfc00..0xfdff
  if ((firstHextet & 0xfe00) === 0xfc00) return true;
  // ff00::/8 — multicast
  if ((firstHextet & 0xff00) === 0xff00) return true;

  return false;
}

/** Extract and return the first 16-bit hextet of a (possibly compressed) IPv6. */
function expandFirstHextet(ip: string): number | null {
  // If it starts with "::", unspecified or any leading-hextet-zero form.
  if (ip.startsWith("::")) return 0;
  const idx = ip.indexOf(":");
  if (idx < 0) return null;
  const head = ip.slice(0, idx);
  const n = Number.parseInt(head, 16);
  if (!Number.isFinite(n) || n < 0 || n > 0xffff) return null;
  return n;
}
