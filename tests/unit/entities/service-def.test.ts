import { describe, expect, it } from "bun:test";
import type { ServiceDef } from "../../../src/entities/service-def.ts";

describe("ServiceDef", () => {
  it("constructs a bearer-auth service", () => {
    const svc: ServiceDef = {
      name: "weather",
      url: "https://api.example.com/weather",
      method: "GET",
      auth: { mode: "bearer", env: "WEATHER_TOKEN" },
      allowPathSuffix: false,
      allowInternal: false,
    };
    expect(svc.auth.mode).toBe("bearer");
  });

  it("exhaustive switch over auth.mode", () => {
    const svc: ServiceDef = {
      name: "svc",
      url: "https://x",
      method: "POST",
      auth: { mode: "query", env: "E", param: "token" },
      allowPathSuffix: true,
      allowInternal: true,
    };
    const tag: string = ((): string => {
      switch (svc.auth.mode) {
        case "none":
          return "none";
        case "bearer":
          return svc.auth.env;
        case "header":
          return svc.auth.header;
        case "query":
          return svc.auth.param;
      }
    })();
    expect(tag).toBe("token");
  });
});
