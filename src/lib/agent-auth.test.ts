import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authenticateAgent } from "./agent-auth";

const req = (auth?: string) =>
  new Request("http://localhost/api/agent/inbox", { headers: auth ? { authorization: auth } : {} });

describe("authenticateAgent", () => {
  const saved = { c: process.env.CLAUDE_AGENT_TOKEN, g: process.env.GPT_AGENT_TOKEN };
  beforeEach(() => {
    process.env.CLAUDE_AGENT_TOKEN = "claude-secret";
    process.env.GPT_AGENT_TOKEN = "gpt-secret";
  });
  afterEach(() => {
    for (const [k, v] of [["CLAUDE_AGENT_TOKEN", saved.c], ["GPT_AGENT_TOKEN", saved.g]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("maps each token to its creator", () => {
    expect(authenticateAgent(req("Bearer claude-secret"))).toBe("claude");
    expect(authenticateAgent(req("Bearer gpt-secret"))).toBe("gpt");
    expect(authenticateAgent(req("bearer gpt-secret"))).toBe("gpt");
  });

  it("rejects missing, malformed or wrong credentials", () => {
    expect(authenticateAgent(req())).toBeNull();
    expect(authenticateAgent(req("claude-secret"))).toBeNull();
    expect(authenticateAgent(req("Basic claude-secret"))).toBeNull();
    expect(authenticateAgent(req("Bearer nope"))).toBeNull();
    expect(authenticateAgent(req("Bearer claude-secre"))).toBeNull();
    expect(authenticateAgent(req("Bearer "))).toBeNull();
  });

  it("never matches an unset or empty token", () => {
    delete process.env.GPT_AGENT_TOKEN;
    process.env.CLAUDE_AGENT_TOKEN = "";
    expect(authenticateAgent(req("Bearer "))).toBeNull();
    expect(authenticateAgent(req("Bearer undefined"))).toBeNull();
    expect(authenticateAgent(req("Bearer gpt-secret"))).toBeNull();
  });
});
