import { saveInterests } from "./interests";

const mockUpsert = jest.fn();
const mockFrom = jest.fn((_table: string) => ({ upsert: mockUpsert }));
jest.mock("@/lib/supabase", () => ({ db: { from: (t: string) => mockFrom(t) } }), { virtual: true });
beforeEach(() => {
  mockUpsert.mockReset();
  mockFrom.mockClear();
});

describe("saveInterests", () => {
  it("upserts on user_id and marks onboarded, like web", async () => {
    mockUpsert.mockResolvedValue({ error: null });
    expect(await saveInterests("u1", ["aosp", "os"])).toBe("");
    expect(mockFrom).toHaveBeenCalledWith("user_interests");
    expect(mockUpsert).toHaveBeenCalledWith({ user_id: "u1", areas: ["aosp", "os"], onboarded: true }, { onConflict: "user_id" });
  });

  it("returns the error copy on failure", async () => {
    mockUpsert.mockResolvedValue({ error: { message: "x" } });
    expect(await saveInterests("u1", ["aosp"])).toBe("Could not save your interests. Try again.");
  });
});
