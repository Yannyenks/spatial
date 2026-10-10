import { describe, expect, it } from "vitest";
import { MAX_WORLD_INSTRUCTION_LENGTH, buildWorldPrompt, worldTags } from "@/lib/world-prompt";

const base = {
  project: { name: "Hotel Lumière", type: "HOTEL" },
  space: { name: "Suite 204", kind: "SUITE" },
};

describe("buildWorldPrompt", () => {
  it("describes the space in its property and asks for a faithful copy by default", () => {
    const prompt = buildWorldPrompt(base);
    expect(prompt).toContain('The suite "Suite 204" of the hotel "Hotel Lumière".');
    expect(prompt).toContain("faithfully as photographed");
  });

  it("lists only what the capture really showed, plus graph features, without duplicates", () => {
    const prompt = buildWorldPrompt({
      ...base,
      objects: [
        { type: "BED", label: "King bed", provenance: "REAL" },
        { type: "TABLE", label: null, provenance: "COMPUTED" },
        { type: "SOFA", label: "Sofa", provenance: "INFERRED" },
        { type: "PLANT", label: "Plant", provenance: "GENERATED" },
      ],
      concepts: ["Balcony", "king bed"],
    });
    expect(prompt).toContain("It contains: king bed, table, balcony.");
    expect(prompt).not.toContain("sofa");
    expect(prompt).not.toContain("plant");
  });

  it("turns an instruction into a layout-preserving change, capped in length", () => {
    const prompt = buildWorldPrompt({ ...base, instruction: `  Scandinavian decor${"!".repeat(1000)}` });
    expect(prompt).toContain("Keep the room's layout");
    expect(prompt).toContain("apply this change: Scandinavian decor");
    expect(prompt).not.toContain("faithfully");
    expect(prompt.length).toBeLessThan(MAX_WORLD_INSTRUCTION_LENGTH + 300);
  });

  it("falls back to generic labels for unknown kinds", () => {
    expect(buildWorldPrompt({ project: { name: "P", type: "NEW" }, space: { name: "S", kind: "ATTIC" } })).toContain(
      'The interior space "S" of the property "P".'
    );
  });
});

describe("worldTags", () => {
  it("keeps cuids whole within World Labs' 32-character tag limit", () => {
    const tags = worldTags({
      projectId: "cmux74lel0008l804q8o9nx5f",
      spaceId: "cmux74n7f000al804m6becw4t",
      spaceKind: "SUITE",
      restyled: true,
    });
    expect(tags).toEqual(["spatial", "s-cmux74n7f000al804m6becw4t", "p-cmux74lel0008l804q8o9nx5f", "suite", "restyled"]);
    expect(tags.every((t) => t.length <= 32)).toBe(true);
  });
});
