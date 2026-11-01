import { renderMotion } from "../motion/testSetup";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { TID } from "@/testids";

const mockAuth = {
  status: "signedOut" as string,
  user: { id: "u1" } as { id: string } | null,
  role: null,
  error: "",
  refresh: jest.fn(async () => {}),
  signInWithGoogle: jest.fn(async () => ({ ok: true as boolean, reason: "" })),
  signInWithPassword: jest.fn(async (_e: string, _p: string) => ""),
  signUpWithInvite: jest.fn(async (_e: string, _p: string, _i: string) => ""),
  redeemInvite: jest.fn(async (_c: string) => ""),
  signOut: jest.fn(async () => {}),
};
jest.mock("@/auth/useAuth", () => ({ useAuth: () => mockAuth }));

const mockSaveInterests = jest.fn(async (_u: string, _a: string[]) => "");
jest.mock("@/data/interests", () => ({ saveInterests: (u: string, a: string[]) => mockSaveInterests(u, a) }));
const mockInsert = jest.fn(async (_rows: unknown) => ({ error: null as null | { code?: string } }));
jest.mock("@/lib/supabase", () => ({ db: { from: () => ({ insert: (rows: unknown) => mockInsert(rows) }) } }));
const mockLibrary: { current: { categories: { slug: string; label: string; description: string }[] } | null } = {
  current: { categories: [{ slug: "android", label: "Android", description: "Inside the OS" }, { slug: "linux", label: "Linux", description: "Kernels" }] },
};
jest.mock("@/data/library", () => ({
  LIBRARY_KEY: ["library"],
  useLibrary: () => ({ library: mockLibrary.current, loading: false, error: "", reload: jest.fn() }),
}));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn(async () => {}) }) }));
// lucide-react-native ships ESM only; icons do not matter here.
jest.mock("lucide-react-native", () => new Proxy({}, { get: (_t, name) => (name === "__esModule" ? false : () => null) }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import Login from "../../../app/login";
import Join from "../../../app/join";
import Onboarding from "../../../app/onboarding";

const press = async (id: string) => {
  await fireEvent(screen.getByTestId(id), "accessibilityAction", { nativeEvent: { actionName: "activate" } });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.error = "";
  mockLibrary.current = { categories: [{ slug: "android", label: "Android", description: "Inside the OS" }, { slug: "linux", label: "Linux", description: "Kernels" }] };
});

describe("login", () => {
  it("renders the web copy and the Google button", async () => {
    await renderMotion(<Login />);
    expect(screen.getByText("Your next scroll could teach you something.")).toBeTruthy();
    expect(screen.getByTestId(TID["login-google"])).toBeTruthy();
    expect(screen.getByTestId(TID["login-email"])).toBeTruthy();
  });

  it("Google press calls signInWithGoogle once", async () => {
    await renderMotion(<Login />);
    await press(TID["login-google"]);
    expect(mockAuth.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("shows the failure copy when Google fails but stays quiet on cancel", async () => {
    mockAuth.signInWithGoogle.mockResolvedValueOnce({ ok: false, reason: "cancelled" });
    await renderMotion(<Login />);
    await press(TID["login-google"]);
    await waitFor(() => expect(mockAuth.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId(TID["login-error"]).props.children).toBe("");
    mockAuth.signInWithGoogle.mockResolvedValueOnce({ ok: false, reason: "failed" });
    await press(TID["login-google"]);
    await waitFor(() =>
      expect(screen.getByTestId(TID["login-error"]).props.children).toBe("Google sign-in failed or expired. Please try again."),
    );
  });

  it("signs in with email and password and shows the returned message", async () => {
    mockAuth.signInWithPassword.mockResolvedValueOnce("Invalid login credentials");
    await renderMotion(<Login />);
    await fireEvent.changeText(screen.getByTestId(TID["login-email"]), "a@b.co ");
    await fireEvent.changeText(screen.getByTestId(TID["login-password"]), "password1");
    await press(TID["login-submit"]);
    await waitFor(() => expect(mockAuth.signInWithPassword).toHaveBeenCalledWith("a@b.co", "password1"));
    await waitFor(() =>
      expect(screen.getByTestId(TID["login-error"]).props.children).toBe("Invalid login credentials"),
    );
  });

  it("create-account mode needs an invite code and passes it to signUpWithInvite", async () => {
    await renderMotion(<Login />);
    await press(TID["login-toggle"]);
    await fireEvent.changeText(screen.getByTestId(TID["login-email"]), "n@b.co");
    await fireEvent.changeText(screen.getByTestId(TID["login-password"]), "password1");
    await press(TID["login-submit"]);
    await waitFor(() =>
      expect(screen.getByTestId(TID["login-error"]).props.children).toBe("Enter an invite code to create an account."),
    );
    expect(mockAuth.signUpWithInvite).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId(TID["join-code"]), " abc123 ");
    await press(TID["login-submit"]);
    await waitFor(() => expect(mockAuth.signUpWithInvite).toHaveBeenCalledWith("n@b.co", "password1", "abc123"));
    expect(screen.getByText("New Google users need an invite code after signing in.")).toBeTruthy();
  });

  it("rejects short passwords before calling auth", async () => {
    await renderMotion(<Login />);
    await fireEvent.changeText(screen.getByTestId(TID["login-email"]), "a@b.co");
    await fireEvent.changeText(screen.getByTestId(TID["login-password"]), "short");
    await press(TID["login-submit"]);
    await waitFor(() =>
      expect(screen.getByTestId(TID["login-error"]).props.children).toBe("Use a password with at least 8 characters."),
    );
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("join", () => {
  it("shows the text returned by redeemInvite", async () => {
    mockAuth.redeemInvite.mockResolvedValueOnce("This invite is invalid, expired, or fully used.");
    await renderMotion(<Join />);
    await fireEvent.changeText(screen.getByTestId(TID["join-code"]), "nope");
    await press(TID["join-submit"]);
    await waitFor(() => expect(mockAuth.redeemInvite).toHaveBeenCalledWith("nope"));
    await waitFor(() =>
      expect(screen.getByTestId(TID["join-error"]).props.children).toBe("This invite is invalid, expired, or fully used."),
    );
  });
});

describe("onboarding", () => {
  it("keeps save disabled until a topic is picked, then saves interests and extra requests", async () => {
    await renderMotion(<Onboarding />);
    expect(screen.getByText("Pick at least one topic")).toBeTruthy();
    await press(TID["onboarding-save"]);
    expect(mockSaveInterests).not.toHaveBeenCalled();
    await press("interest-android");
    expect(screen.getByText("Start learning")).toBeTruthy();
    await press(TID["onboarding-save"]);
    await waitFor(() => expect(mockSaveInterests).toHaveBeenCalledWith("u1", ["android"]));
    expect(mockInsert).not.toHaveBeenCalled();
    await waitFor(() => expect(mockAuth.refresh).toHaveBeenCalledTimes(1));
  });

  it("flags requests outside the length limits", async () => {
    await renderMotion(<Onboarding />);
    await press("interest-linux");
    const field = screen.getByLabelText(/What else do you want to learn/);
    await fireEvent.changeText(field, "ab");
    expect(screen.getByText("Each request needs 3-200 characters.")).toBeTruthy();
    await press(TID["onboarding-save"]);
    expect(mockSaveInterests).not.toHaveBeenCalled();
  });
});
