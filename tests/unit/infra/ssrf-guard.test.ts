import { describe, expect, it } from "bun:test";
import { isBlockedAddress } from "../../../src/infra/proxy/ssrf-guard.ts";

describe("isBlockedAddress — IPv4", () => {
  it("blocks loopback 127.0.0.0/8", () => {
    expect(isBlockedAddress("127.0.0.1")).toBe(true);
    expect(isBlockedAddress("127.255.255.255")).toBe(true);
  });

  it("blocks 10.0.0.0/8", () => {
    expect(isBlockedAddress("10.0.0.1")).toBe(true);
    expect(isBlockedAddress("10.255.255.254")).toBe(true);
  });

  it("blocks 172.16.0.0/12", () => {
    expect(isBlockedAddress("172.16.0.1")).toBe(true);
    expect(isBlockedAddress("172.31.255.254")).toBe(true);
    // boundaries: 172.15 and 172.32 are NOT private
    expect(isBlockedAddress("172.15.0.1")).toBe(false);
    expect(isBlockedAddress("172.32.0.1")).toBe(false);
  });

  it("blocks 192.168.0.0/16", () => {
    expect(isBlockedAddress("192.168.1.1")).toBe(true);
    expect(isBlockedAddress("192.167.255.255")).toBe(false);
  });

  it("blocks link-local 169.254.0.0/16", () => {
    expect(isBlockedAddress("169.254.0.1")).toBe(true);
  });

  it("blocks cloud metadata 169.254.169.254 explicitly", () => {
    expect(isBlockedAddress("169.254.169.254")).toBe(true);
  });

  it("blocks 0.0.0.0/8 and multicast 224/4", () => {
    expect(isBlockedAddress("0.0.0.0")).toBe(true);
    expect(isBlockedAddress("224.0.0.1")).toBe(true);
    expect(isBlockedAddress("239.0.0.1")).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
    expect(isBlockedAddress("151.101.65.69")).toBe(false);
  });
});

describe("isBlockedAddress — IPv6", () => {
  it("blocks loopback ::1", () => {
    expect(isBlockedAddress("::1")).toBe(true);
  });

  it("blocks unspecified ::", () => {
    expect(isBlockedAddress("::")).toBe(true);
  });

  it("blocks link-local fe80::/10", () => {
    expect(isBlockedAddress("fe80::1")).toBe(true);
  });

  it("blocks unique-local fc00::/7", () => {
    expect(isBlockedAddress("fc00::1")).toBe(true);
    expect(isBlockedAddress("fd12:3456:789a::1")).toBe(true);
  });

  it("blocks IPv4-mapped loopback ::ffff:127.0.0.1", () => {
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("blocks IPv4-mapped metadata ::ffff:169.254.169.254", () => {
    expect(isBlockedAddress("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows global IPv6 addresses", () => {
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("isBlockedAddress — malformed", () => {
  it("rejects invalid input as blocked (fail-closed)", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
    expect(isBlockedAddress("999.999.999.999")).toBe(true);
  });
});
