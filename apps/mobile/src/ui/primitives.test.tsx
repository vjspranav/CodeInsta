import { renderMotion } from "./motion/testSetup";
import { fireEvent, screen } from "@testing-library/react-native";
import { Text } from "react-native";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 10, bottom: 20, left: 0, right: 0 }),
}));

import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Screen } from "./Screen";
import { TextField } from "./TextField";

const activate = async (id: string) => {
  await fireEvent(screen.getByTestId(id), "accessibilityAction", { nativeEvent: { actionName: "activate" } });
};

describe("Button", () => {
  it("calls onPress once", async () => {
    const onPress = jest.fn();
    await renderMotion(<Button testID="b" label="Go" onPress={onPress} />);
    await activate("b");
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("ignores presses while busy or disabled", async () => {
    const onPress = jest.fn();
    await renderMotion(
      <>
        <Button testID="busy" label="Busy" busy onPress={onPress} />
        <Button testID="off" label="Off" disabled onPress={onPress} />
      </>,
    );
    await activate("busy");
    await activate("off");
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("TextField", () => {
  it("labels the input and forwards changes", async () => {
    const onChangeText = jest.fn();
    await renderMotion(<TextField label="Email" testID="e" onChangeText={onChangeText} hint="Required" />);
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("e"), "x");
    expect(onChangeText).toHaveBeenCalledWith("x");
  });
});

describe("EmptyState and Screen", () => {
  it("renders title and body", async () => {
    await renderMotion(<EmptyState title="Nothing yet" body="Come back soon." testID="empty" />);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    expect(screen.getByText("Come back soon.")).toBeTruthy();
  });

  it("applies safe-area insets", async () => {
    await renderMotion(
      <Screen testID="s">
        <Text>inside</Text>
      </Screen>,
    );
    const style = screen.getByTestId("s").props.style.flat(Infinity).filter(Boolean);
    expect(style.some((s: { paddingTop?: number }) => s.paddingTop === 10)).toBe(true);
  });
});
