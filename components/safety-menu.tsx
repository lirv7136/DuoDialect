/**
 * Report and Block, behind the ⋯ in the header of a chat or a person's profile: always
 * reachable, never in the way. Both places confirm a block with the same words
 * (src/domain/safety-copy.ts). iOS uses the native action sheet; Android and web use a
 * bottom sheet, because Alert has no buttons on web.
 */
import { useState } from "react";
import { ActionSheetIOS, Alert, Platform } from "react-native";
import { BLOCK_CONFIRM_BODY, blockTitle } from "../src/domain/safety-copy";
import { Sheet } from "./sheet";
import { Button, IconButton } from "./ui";

type Confirm = { title: string; body: string; confirm: string; cancel?: string; destructive?: boolean; onConfirm: () => void };

/** A two-button confirmation. On web, where Alert can't show buttons, the browser's own confirm. */
export function confirmAction({ title, body, confirm, cancel = "Cancel", destructive = true, onConfirm }: Confirm) {
  if (Platform.OS === "web") {
    const ask = (globalThis as { confirm?: (message: string) => boolean }).confirm;
    if (!ask || ask(`${title}\n\n${body}`)) onConfirm();
    return;
  }
  Alert.alert(title, body, [
    { text: cancel, style: "cancel" },
    { text: confirm, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}

/** The block confirmation, word for word the same on Person, Chat and Report. */
export function confirmBlock(name: string, onConfirm: () => void) {
  confirmAction({ title: blockTitle(name), body: BLOCK_CONFIRM_BODY, confirm: "Block", onConfirm });
}

/** The ⋯ button and its menu. Render `menu` once in the screen and `button` in the header. */
export function useSafetyMenu({ name, onReport, onBlock }: { name: string; onReport: () => void; onBlock: () => void }) {
  const [open, setOpen] = useState(false);
  const who = name || "this member";
  const report = `Report ${who}`, block = `Block ${who}`;

  function show() {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [report, block, "Cancel"], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        index => { if (index === 0) onReport(); if (index === 1) onBlock(); },
      );
      return;
    }
    setOpen(true);
  }

  const pick = (action: () => void) => { setOpen(false); action(); };

  return {
    button: () => <IconButton icon="ellipsis-horizontal" label={`More options for ${who}`} hint={`Report or block ${who}`} onPress={show} />,
    menu: (
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <Button icon="flag-outline" label={report} onPress={() => pick(onReport)} />
        <Button variant="danger" icon="ban-outline" label={block} onPress={() => pick(onBlock)} />
        <Button variant="ghost" label="Cancel" onPress={() => setOpen(false)} />
      </Sheet>
    ),
  };
}
