import { afterEach, describe, expect, it, vi } from "vitest";
import { FarmFlowApi } from "@/lib/api-client";

afterEach(() => vi.restoreAllMocks());
describe("FarmFlowApi", () => {
  it("parses typed successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 })));
    const api = new FarmFlowApi("http://test", 100);
    await expect(api.request("/health")).resolves.toEqual({ status: "ok" });
    expect(fetch).toHaveBeenCalledWith("http://test/health", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it("surfaces backend detail messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "invalid transition" }), { status: 409 })));
    await expect(new FarmFlowApi().request("/bad")).rejects.toEqual(expect.objectContaining({ name: "ApiError", message: "invalid transition", status: 409 }));
  });
});
