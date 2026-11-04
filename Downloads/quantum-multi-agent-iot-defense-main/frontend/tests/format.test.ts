import { describe, expect, it } from "vitest";
import { compactNumber, formatTime, titleCase } from "@/lib/format";
describe("format helpers", () => {
  it("formats operational values consistently", () => {
    expect(compactNumber(1500)).toBe("1.5K"); expect(titleCase("protect_gateway_mode")).toBe("Protect Gateway Mode"); expect(formatTime(null)).toBe("--:--:--");
  });
});
