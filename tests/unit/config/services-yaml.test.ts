import { describe, expect, it } from "bun:test";
import { ServicesYamlSchema } from "../../../src/infra/config/services-yaml-schema.ts";

describe("ServicesYamlSchema", () => {
  it("parses a minimal none-auth service", () => {
    const parsed = ServicesYamlSchema.parse({
      services: [
        {
          name: "weather",
          url: "https://api.example.com/weather",
          method: "GET",
          auth: { mode: "none" },
        },
      ],
    });
    expect(parsed.services[0]!.name).toBe("weather");
    expect(parsed.services[0]!.allow_path_suffix).toBe(false);
    expect(parsed.services[0]!.allow_internal).toBe(false);
  });

  it("parses a bearer-auth service", () => {
    const parsed = ServicesYamlSchema.parse({
      services: [
        {
          name: "gh",
          url: "https://api.github.com",
          method: "POST",
          auth: { mode: "bearer", env: "GH_TOKEN" },
          headers: { "X-Custom": "yes" },
        },
      ],
    });
    expect(parsed.services[0]!.auth.mode).toBe("bearer");
  });

  it("rejects invalid service name (uppercase)", () => {
    expect(() =>
      ServicesYamlSchema.parse({
        services: [
          {
            name: "BadName",
            url: "https://x",
            method: "GET",
            auth: { mode: "none" },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects unknown method", () => {
    expect(() =>
      ServicesYamlSchema.parse({
        services: [
          {
            name: "ok",
            url: "https://x",
            method: "CONNECT",
            auth: { mode: "none" },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects bearer without env", () => {
    expect(() =>
      ServicesYamlSchema.parse({
        services: [
          {
            name: "ok",
            url: "https://x",
            method: "GET",
            auth: { mode: "bearer" },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects non-URL url", () => {
    expect(() =>
      ServicesYamlSchema.parse({
        services: [
          {
            name: "ok",
            url: "not-a-url",
            method: "GET",
            auth: { mode: "none" },
          },
        ],
      }),
    ).toThrow();
  });
});
