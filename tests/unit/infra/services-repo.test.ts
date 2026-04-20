import { describe, expect, it } from "bun:test";
import { ServicesRepo } from "../../../src/infra/config/services-repo.ts";

const OK_YAML = `
services:
  - name: openai
    url: https://api.openai.com/v1/chat/completions
    method: POST
    description: OpenAI-style chat completions
    auth:
      mode: bearer
      env: OPENAI_API_KEY
    headers:
      Content-Type: application/json
  - name: github
    url: https://api.github.com
    method: GET
    auth:
      mode: header
      env: GITHUB_TOKEN
      header: Authorization
    allow_path_suffix: true
`;

describe("ServicesRepo", () => {
  it("loads + validates a valid services.yaml", () => {
    const repo = new ServicesRepo(OK_YAML);
    expect(repo.services).toHaveLength(2);
    const openai = repo.byName("openai");
    expect(openai?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(openai?.auth.mode).toBe("bearer");
    const github = repo.byName("github");
    expect(github?.allow_path_suffix).toBe(true);
  });

  it("byName returns undefined for unknown service", () => {
    const repo = new ServicesRepo(OK_YAML);
    expect(repo.byName("does-not-exist")).toBeUndefined();
  });

  it("throws ConfigError on malformed YAML", () => {
    expect(() => new ServicesRepo(":::not yaml:::")).toThrow();
  });

  it("throws ConfigError on invalid service entry (bad name regex)", () => {
    expect(
      () =>
        new ServicesRepo(`
services:
  - name: "HAS UPPERCASE"
    url: https://x.example.com
    method: GET
    auth:
      mode: none
`),
    ).toThrow();
  });

  it("throws ConfigError on missing auth env for bearer", () => {
    expect(
      () =>
        new ServicesRepo(`
services:
  - name: x
    url: https://x.example.com
    method: GET
    auth:
      mode: bearer
`),
    ).toThrow();
  });
});
