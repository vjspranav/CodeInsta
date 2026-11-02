import { renderMotion } from "./motion/testSetup";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("lucide-react-native", () =>
  jest.requireActual(require("path").resolve(__dirname, "../../node_modules/lucide-react-native/dist/cjs/lucide-react-native.js")),
);
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@/ui/CreatorAvatar", () => ({
  CreatorAvatar: ({ creatorId }: { creatorId: string }) => require("react").createElement(require("react-native").View, { testID: `avatar-${creatorId}` }),
}));
jest.mock("@/auth/useAuth", () => ({ useAuth: () => mockAuth }));
jest.mock("@/data/library", () => ({
  useLibrary: () => ({
    library: { creators: [{ id: "gpt", display_name: "GPT", avatar_url: null }] },
    loading: false,
    error: "",
    reload: jest.fn(),
  }),
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => require("react").createElement(require("react-native").Text, null, href),
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (fn: () => void) => require("react").useEffect(fn, [fn]),
}));
jest.mock("@shopify/flash-list", () => ({
  FlashList: ({ data, renderItem, ListEmptyComponent, keyExtractor }: any) => {
    const React = require("react");
    return (
      <>
        {data.map((item: any, index: number) => React.createElement(React.Fragment, { key: keyExtractor(item, index) }, renderItem({ item, index })))}
        {!data.length && ListEmptyComponent}
      </>
    );
  },
}));
jest.mock("@/data/inbox", () => ({ ...jest.requireActual("@/data/inbox"), fetchThreads: jest.fn(), markThreadRead: jest.fn(), sendMessage: jest.fn() }));
jest.mock("@/data/asks", () => ({ ...jest.requireActual("@/data/asks"), fetchAsks: jest.fn() }));
jest.mock("@/lib/supabase", () => ({ db: {} }));

import Inbox from "../../app/(tabs)/inbox";
import ThreadScreen from "../../app/inbox/[creator]";
import type { Ask } from "@/data/asks";
import { fetchAsks } from "@/data/asks";
import { fetchThreads, markThreadRead, sendMessage, SEND_ERROR, UNREAD_KEY } from "@/data/inbox";

let mockAuth: any;
let mockParams: Record<string, string>;
let client: QueryClient;
const answer = { id: "1", creator_id: "gpt", user_id: "u", sender: "creator", body_md: "An answer", created_at: "2026-11-02T10:00:00Z", read_at: null, feedback_id: "f1" };
const row = { creatorId: "gpt", lastBody: "An answer", lastAt: "2026-11-02T10:00:00Z", unread: 1, messages: [answer] };
const ask = (id: string, over: Partial<Ask> = {}): Ask => ({
  id,
  creatorId: "gpt",
  reelId: `reel-${id}`,
  reelTitle: `Reel ${id}`,
  body: `Question ${id}`,
  wants: "dm",
  createdAt: "2026-11-02T09:00:00Z",
  status: "waiting",
  answerMessageId: null,
  answerReel: null,
  ...over,
});
const wrap = (element: React.ReactNode) => <QueryClientProvider client={client}>{element}</QueryClientProvider>;
const tap = (id: string) => fireEvent(screen.getByTestId(id), "accessibilityAction", { nativeEvent: { actionName: "activate" } });

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { status: "ready", user: { id: "u" }, role: "owner" };
  mockParams = { creator: "gpt" };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  (fetchThreads as jest.Mock).mockResolvedValue([row]);
  (fetchAsks as jest.Mock).mockResolvedValue([]);
  (markThreadRead as jest.Mock).mockResolvedValue(undefined);
  (sendMessage as jest.Mock).mockResolvedValue("");
});
afterEach(() => client.clear());

describe("Inbox list", () => {
  it("shows an unread creator dot and the creator logo", async () => {
    await renderMotion(wrap(<Inbox />));
    await waitFor(() => expect(screen.getByLabelText("1 unread messages")).toBeTruthy());
    expect(screen.getByTestId("avatar-gpt")).toBeTruthy();
  });

  it("lists asks under their creator with status and answer links", async () => {
    mockAuth.role = "member";
    (fetchAsks as jest.Mock).mockResolvedValue([
      ask("w"),
      ask("d", { status: "answered", answerMessageId: "1" }),
      ask("r", { status: "answered", wants: "reel", answerReel: { id: "ans", title: "Deeper" } }),
    ]);
    await renderMotion(wrap(<Inbox />));
    await waitFor(() => expect(screen.getByText("Question w")).toBeTruthy());
    expect(screen.getByText("Reel w")).toBeTruthy();
    expect(screen.getByText("Waiting for GPT")).toBeTruthy();
    expect(screen.getAllByText("Answered")).toHaveLength(2);

    await tap("ask-status-w-reel");
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/reel/[id]", params: { id: "reel-w" } });
    await tap("ask-status-d-answer");
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/inbox/[creator]", params: { creator: "gpt", message: "1" } });
    await tap("ask-status-r-answer-reel");
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/reel/[id]", params: { id: "ans" } });
  });

  it("previews waiting questions when a thread has no messages, and caps the list", async () => {
    mockAuth.role = "member";
    (fetchThreads as jest.Mock).mockResolvedValue([]);
    (fetchAsks as jest.Mock).mockResolvedValue([ask("a"), ask("b"), ask("c"), ask("d")]);
    await renderMotion(wrap(<Inbox />));
    await waitFor(() => expect(screen.getByText("4 questions waiting for GPT")).toBeTruthy());
    expect(screen.queryByText("Question d")).toBeNull();
    await tap("inbox-more-gpt");
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/inbox/[creator]", params: { creator: "gpt" } });
  });
});

describe("Thread", () => {
  it("marks read once and clears shared thread and badge caches", async () => {
    client.setQueryData(["inbox", "threads", "u"], [row]);
    client.setQueryData(UNREAD_KEY, 1);
    const view = await renderMotion(wrap(<ThreadScreen />));
    await waitFor(() => expect(markThreadRead).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(client.getQueryData<any[]>(["inbox", "threads", "u"])?.[0].unread).toBe(0));
    expect(client.getQueryData(UNREAD_KEY)).toBe(0);
    await view.rerender(wrap(<ThreadScreen />));
    expect(markThreadRead).toHaveBeenCalledTimes(1);
  });

  it("shows pending asks instead of the empty state", async () => {
    mockAuth.role = "member";
    (fetchThreads as jest.Mock).mockResolvedValue([]);
    (fetchAsks as jest.Mock).mockResolvedValue([ask("w"), ask("other", { creatorId: "claude" })]);
    await renderMotion(wrap(<ThreadScreen />));
    await waitFor(() => expect(screen.getByText("Question w")).toBeTruthy());
    expect(screen.getByText("Waiting for GPT")).toBeTruthy();
    expect(screen.queryByText("Question other")).toBeNull();
    expect(screen.queryByText("No answers from GPT yet.")).toBeNull();
  });

  it("shows the empty state with no messages and no asks", async () => {
    mockAuth.role = "member";
    (fetchThreads as jest.Mock).mockResolvedValue([]);
    await renderMotion(wrap(<ThreadScreen />));
    await waitFor(() => expect(screen.getByText("No answers from GPT yet.")).toBeTruthy());
  });

  it("puts the question right above the DM that answers it", async () => {
    (fetchAsks as jest.Mock).mockResolvedValue([ask("f1", { status: "answered", answerMessageId: "1" })]);
    await renderMotion(wrap(<ThreadScreen />));
    await waitFor(() => expect(screen.getByText("Question f1")).toBeTruthy());
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf("Question f1")).toBeLessThan(tree.indexOf("An answer"));
    expect(tree.indexOf("An answer")).toBeGreaterThan(-1);
  });

  it("disables whitespace and preserves draft on failed send with rollback", async () => {
    await renderMotion(wrap(<ThreadScreen />));
    await waitFor(() => expect(screen.getByTestId("dm-input")).toBeTruthy());
    expect(screen.getByTestId("dm-send").props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId("dm-input"), "  ");
    expect(screen.getByTestId("dm-send").props.accessibilityState.disabled).toBe(true);
    (sendMessage as jest.Mock).mockResolvedValue(SEND_ERROR);
    await fireEvent.changeText(screen.getByTestId("dm-input"), "  My question  ");
    await tap("dm-send");
    await waitFor(() => expect(screen.getByText(SEND_ERROR)).toBeTruthy());
    expect(screen.getByTestId("dm-input").props.value).toBe("  My question  ");
    expect(screen.queryByText("My question")).toBeNull();
  });

  it("inserts optimistically and clears the draft on success", async () => {
    let finish!: (value: string) => void;
    (sendMessage as jest.Mock).mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await renderMotion(wrap(<ThreadScreen />));
    await waitFor(() => expect(screen.getByText("An answer")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("dm-input"), "Question");
    await tap("dm-send");
    await waitFor(() => expect(screen.getByText("Question")).toBeTruthy());
    await act(async () => finish(""));
    await waitFor(() => expect(screen.getByTestId("dm-input").props.value).toBe(""));
  });

  it("does not offer members a composer", async () => {
    mockAuth.role = "member";
    await renderMotion(wrap(<ThreadScreen />));
    await waitFor(() => expect(screen.getByText("An answer")).toBeTruthy());
    expect(screen.queryByTestId("dm-input")).toBeNull();
  });

  it("guards deep links before loading private threads", async () => {
    mockAuth.status = "signedOut";
    mockAuth.user = null;
    await renderMotion(wrap(<ThreadScreen />));
    expect(screen.getByText("/login")).toBeTruthy();
    expect(fetchThreads).not.toHaveBeenCalled();
    expect(fetchAsks).not.toHaveBeenCalled();
  });
});
