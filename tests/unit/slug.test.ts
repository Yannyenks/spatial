import { describe, expect, it } from "vitest";
import { slugify, withRandomSuffix } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hotel Riviera")).toBe("hotel-riviera");
  });

  it("strips diacritics", () => {
    expect(slugify("Hôtel Éléganza")).toBe("hotel-eleganza");
  });

  it("collapses non-alphanumeric runs and trims edges", () => {
    expect(slugify("  --Villa!!  Côte d'Azur--  ")).toBe("villa-cote-d-azur");
  });

  it("falls back to a default for empty input", () => {
    expect(slugify("###")).toBe("space");
  });
});

describe("withRandomSuffix", () => {
  it("appends a suffix distinct from the base", () => {
    const result = withRandomSuffix("hotel-riviera");
    expect(result).toMatch(/^hotel-riviera-[a-z0-9]{5}$/);
  });
});
