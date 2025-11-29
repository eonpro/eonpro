import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  process.env = { ...process.env, NODE_ENV: "test" };
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

