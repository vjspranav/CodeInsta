import { renderMotion } from "@/ui/motion/testSetup";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { Share } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

import { TID } from "@/testids";
import { activate, fireGesture, flush } from "@/ui/feed/testUtils";

jest.mock("lucide-react-native", () =>
  jest.requireActual(require("path").resolve(__dirname, "../../../node_modules/lucide-react-native/dist/cjs/lucide-react-native.js")),
);
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockAuth: { role: "owner" | "member" } = { role: "member" };
jest.mock("@/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, role: mockAuth.role }),
}));
const mockMeaningful = jest.fn();
jest.mock("@/push/register", () => ({ markMeaningfulAction: () => mockMeaningful() }));
const mockAsksLeft = jest.fn();
const mockAskQuestion = jest.fn();
jest.mock("@/data/asks", () => ({
  asksLeft: (...args: unknown[]) => mockAsksLeft(...args),
  askQuestion: (...args: unknown[]) => mockAskQuestion(...args),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

import { AskSheet, LIMIT_COPY } from "./AskSheet";
import { GlossarySheet } from "./GlossarySheet";
import { ShareAction, shareMessage } from "./ShareAction";

const reel = { id: "r1", title: "How DNS works", creator_id: "claude" };

beforeEach(() => {
  mockAuth.role = "member";
  mockMeaningful.mockReset();
  mockAsksLeft.mockReset().mockResolvedValue(3);
  mockAskQuestion.mockReset().mockResolvedValue("");
  mockPush.mockReset();
});

const type = async (text: string) => {
  await fireEvent.changeText(screen.getByTestId(TID["ask-input"]), text);
  await flush();
};
const isDisabled = (id: string) => screen.getByTestId(id).props.accessibilityState?.disabled === true;

describe("AskSheet", () => {
  const open = async (over: Partial<React.ComponentProps<typeof AskSheet>> = {}) => {
    const onClose = jest.fn();
    const onSent = jest.fn();
    await renderMotion(<AskSheet visible onClose={onClose} reel={reel} onSent={onSent} {...over} />);
    await flush();
    return { onClose, onSent };
  };

  it("renders nothing while closed", async () => {
    await renderMotion(<AskSheet visible={false} onClose={jest.fn()} reel={reel} />);
    expect(screen.queryByTestId(TID["ask-input"])).toBeNull();
  });

  it("names who answers and what the question is about", async () => {
    await open();
    expect(screen.getByText("Ask Claude about this reel")).toBeTruthy();
    expect(screen.getByText("About “How DNS works”")).toBeTruthy();
    expect(screen.getByText("Answer in my inbox")).toBeTruthy();
    expect(screen.getByText("Make a reel about it")).toBeTruthy();
  });

  it("disables send for empty or blank text", async () => {
    await open();
    expect(isDisabled(TID["ask-send"])).toBe(true);
    await type("   ");
    expect(isDisabled(TID["ask-send"])).toBe(true);
    await activate(TID["ask-send"]);
    expect(mockAskQuestion).not.toHaveBeenCalled();
    await type("What is a resolver?");
    expect(isDisabled(TID["ask-send"])).toBe(false);
  });

  it("shows how many questions a member has left", async () => {
    mockAsksLeft.mockResolvedValue(2);
    await open();
    expect(screen.getByText("2 of 3 questions left today")).toBeTruthy();
    expect(mockAsksLeft).toHaveBeenCalledWith("u1", false);
  });

  it("blocks a member with no questions left: limit message, no sending", async () => {
    mockAsksLeft.mockResolvedValue(0);
    await open();
    expect(screen.getByTestId(TID["ask-limit"])).toBeTruthy();
    expect(screen.getByText(LIMIT_COPY)).toBeTruthy();
    expect(screen.queryByText(/questions left today/)).toBeNull();
    await type("one more");
    expect(isDisabled(TID["ask-send"])).toBe(true);
    await activate(TID["ask-send"]);
    expect(mockAskQuestion).not.toHaveBeenCalled();
  });

  it("never shows a counter or a limit to the owner", async () => {
    mockAuth.role = "owner";
    mockAsksLeft.mockResolvedValue(null);
    await open();
    expect(mockAsksLeft).toHaveBeenCalledWith("u1", true);
    expect(screen.queryByText(/questions left today/)).toBeNull();
    expect(screen.queryByTestId(TID["ask-limit"])).toBeNull();
    await type("note to self");
    expect(isDisabled(TID["ask-send"])).toBe(false);
  });

  it("sends the question and confirms where the answer arrives", async () => {
    const { onClose, onSent } = await open();
    await type("  What is a resolver?  ");
    await activate(TID["ask-send"]);
    expect(mockAskQuestion).toHaveBeenCalledTimes(1);
    expect(mockAskQuestion).toHaveBeenCalledWith({
      reelId: "r1",
      creatorId: "claude",
      body: "  What is a resolver?  ",
      wants: "dm",
    });
    expect(screen.getByText("Sent to Claude")).toBeTruthy();
    expect(screen.getByTestId("ask-sent").props.children).toBe("Claude will answer in your Inbox, usually within the hour.");
    expect(screen.getByText("2 of 3 questions left today")).toBeTruthy();
    expect(onSent).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockMeaningful).toHaveBeenCalledTimes(1);
  });

  it("Go to Inbox closes the sheet and opens that creator's thread", async () => {
    const { onClose } = await open();
    await type("What is a resolver?");
    await activate(TID["ask-send"]);
    await activate("ask-go-inbox");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/inbox/[creator]", params: { creator: "claude" } });
  });

  it("Done just closes the confirmation", async () => {
    const { onClose } = await open();
    await type("Why?");
    await activate(TID["ask-send"]);
    await activate("ask-done");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("asks for a reel when that answer is chosen", async () => {
    await open();
    await type("Explain TTL");
    await activate("ask-wants-reel");
    await activate(TID["ask-send"]);
    expect(mockAskQuestion).toHaveBeenCalledWith(expect.objectContaining({ wants: "reel" }));
    expect(screen.getByTestId("ask-sent").props.children).toBe("Claude will make a reel about it. Track it in your Inbox.");
  });

  it("keeps the sheet open and shows the error when sending fails", async () => {
    mockAskQuestion.mockResolvedValue("Could not send. Please try again.");
    const { onClose, onSent } = await open();
    await type("hello");
    await activate(TID["ask-send"]);
    expect(screen.getByText("Could not send. Please try again.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
    expect(mockMeaningful).not.toHaveBeenCalled();
  });

  it("switches to the limit message when the server reports the limit", async () => {
    mockAskQuestion.mockResolvedValue(LIMIT_COPY);
    await open();
    await type("hello");
    await activate(TID["ask-send"]);
    expect(screen.getByTestId(TID["ask-limit"])).toBeTruthy();
    expect(isDisabled(TID["ask-send"])).toBe(true);
  });

  it("addresses GPT for a GPT reel", async () => {
    await open({ reel: { ...reel, creator_id: "gpt" } });
    expect(screen.getByText("Ask GPT about this reel")).toBeTruthy();
  });

  it("closes from the close button, the scrim and a drag down", async () => {
    const { onClose } = await open();
    await activate(TID["ask-close"]);
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireGesture("ask-sheet-scrim");
    expect(onClose).toHaveBeenCalledTimes(2);
    fireGestureHandler(getByGestureTestId("ask-sheet-pan"), [
      { state: State.BEGAN },
      { state: State.ACTIVE, changeY: 0, translationY: 0 },
      { changeY: 400, translationY: 400, velocityY: 1500 },
      { state: State.END, velocityY: 1500, translationY: 400 },
    ]);
    await flush();
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("closes on Android back (modal request close)", async () => {
    const { onClose } = await open();
    await fireEvent(screen.getByTestId("ask-sheet-modal"), "requestClose");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("GlossarySheet", () => {
  const entries = [
    { term: "DNS", full: "Domain Name System", note: "The phone book of the internet" },
    { term: "TTL", full: "Time To Live" },
    { term: "POP", full: "Point of Presence", note: "A local edge location" },
  ];

  it("renders every entry with its note", async () => {
    await renderMotion(<GlossarySheet visible onClose={jest.fn()} entries={entries} />);
    expect(screen.getAllByTestId("glossary-entry")).toHaveLength(3);
    for (const e of entries) {
      expect(screen.getByText(e.term)).toBeTruthy();
      expect(screen.getByText(e.full)).toBeTruthy();
      if (e.note) expect(screen.getByText(e.note)).toBeTruthy();
    }
  });

  it("closes from its close button", async () => {
    const onClose = jest.fn();
    await renderMotion(<GlossarySheet visible onClose={onClose} entries={entries} />);
    await activate(TID["glossary-close"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while closed", async () => {
    await renderMotion(<GlossarySheet visible={false} onClose={jest.fn()} entries={entries} />);
    expect(screen.queryByText("Domain Name System")).toBeNull();
  });
});

describe("ShareAction", () => {
  it("shares the title and the web link once", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    await renderMotion(<ShareAction reel={reel} />);
    await activate(TID["reel-share"]);
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ message: "How DNS works https://codeinsta.vjspranav.dev/reel/r1" });
    expect(shareMessage(reel)).toBe("How DNS works https://codeinsta.vjspranav.dev/reel/r1");
    share.mockRestore();
  });

  it("survives a failing share sheet", async () => {
    const share = jest.spyOn(Share, "share").mockRejectedValue(new Error("no activity"));
    await renderMotion(<ShareAction reel={reel} />);
    await activate(TID["reel-share"]);
    expect(share).toHaveBeenCalledTimes(1);
    share.mockRestore();
  });
});
