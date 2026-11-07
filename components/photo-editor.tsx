/**
 * The profile photo row: up to three slots, add, remove and make main. Driven by
 * usePhotoEditor, which owns the upload, screening and saving. Every control keeps a 48dp
 * touch target and says which photo it acts on. The main photo must show one clear face; a
 * photo without one is marked as an extra and cannot be made main. `required` is for a new
 * profile, which needs a photo.
 */
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { usePhotoEditor } from "../hooks/use-photo-editor";
import { EXTRA_ONLY_LABEL, MAX_PHOTOS, canBeMain, slotStatusLabel } from "../src/domain/photos";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, ErrorNotice, styles, type IconName } from "./ui";
import { InfoButton } from "./sheet";
import { PhotoTile, bubbleShape } from "./avatar";
import { colors, fonts, space, TOUCH_TARGET } from "../constants/theme";

const TILE = 104;

export function PhotoEditor({ editor, icon, required = false }: {
  editor: ReturnType<typeof usePhotoEditor>; icon?: IconName; required?: boolean;
}) {
  const { slots, notice, saving, canAdd, add, remove, makeMain, mainProblem } = editor;
  const total = slots.length;
  const about = required
    ? `At least one, up to ${MAX_PHOTOS}. The first is your main photo: just you, with your face clearly visible. Each is checked automatically before anyone sees it.`
    : `Optional, up to ${MAX_PHOTOS}. The first is your main photo and needs to show your face clearly. Each is checked automatically before anyone sees it.`;

  return (
    <View style={{ gap: space.sm }}>
      <View style={[styles.row, { justifyContent: "space-between", flexWrap: "nowrap" }]}>
        <View style={[styles.row, { gap: 0, flexShrink: 1 }]}>
          {icon ? <Ionicons name={icon} size={16} color={colors.text} style={{ marginRight: space.xs }} /> : null}
          <Text accessibilityRole="header" style={styles.label}>Photos</Text>
          <InfoButton label="About photos" title="Photos" body={about} />
        </View>
        <Text style={styles.hint} accessibilityLabel={`${total} of ${MAX_PHOTOS} photos`}>{`${total}/${MAX_PHOTOS}`}</Text>
      </View>
      <Text style={styles.hint}>{required ? "Add a clear photo of your face. It’s how your partner will find you." : "A clear photo of your face helps partners find you."}</Text>

      <View style={[styles.row, { alignItems: "flex-start" }]}>
        {slots.map((slot, index) => {
          const status = slotStatusLabel(slot);
          const extraOnly = slot.status === "ready" && !canBeMain(slot);
          const label = `Your photo ${index + 1} of ${total}${index === 0 && !extraOnly ? ", main photo" : ""}${status ? `, ${status}` : ""}${extraOnly ? ", no clear face, so it can’t be your main photo" : ""}`;
          return (
            <View key={slot.id} style={{ width: TILE, gap: space.xs }}>
              <View>
                <PhotoTile localUri={slot.localUri} path={slot.path} label={label} size={TILE} />
                {status ? (
                  <View
                    accessibilityLiveRegion="polite"
                    style={{
                      position: "absolute", left: 0, right: 0, top: 0, bottom: 0, ...bubbleShape(TILE),
                      backgroundColor: colors.scrimStrong, alignItems: "center", justifyContent: "center", gap: 4, padding: 4,
                    }}
                  >
                    <ActivityIndicator color={colors.onPrimary} />
                    <Text style={{ color: colors.onPrimary, fontSize: 13, fontFamily: fonts.bold, textAlign: "center" }}>{status}</Text>
                  </View>
                ) : null}
                {index === 0 && !status && !extraOnly ? (
                  <View style={{ position: "absolute", left: 8, top: 8, backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: colors.onAccent, fontSize: 12, fontFamily: fonts.bold }}>Main</Text>
                  </View>
                ) : null}
                {extraOnly ? (
                  <View style={{ position: "absolute", left: 8, top: 8, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: colors.text, fontSize: 12, fontFamily: fonts.bold }}>{EXTRA_ONLY_LABEL}</Text>
                  </View>
                ) : null}
              </View>
              {index > 0 && canBeMain(slot) ? (
                <Button label="Make main" accessibilityLabel={`Make photo ${index + 1} your main photo`}
                  onPress={() => makeMain(slot.id)} style={{ paddingHorizontal: space.xs }} />
              ) : null}
              <Button variant="ghost" label="Remove" accessibilityLabel={`Remove photo ${index + 1}`}
                onPress={() => remove(slot.id)} style={{ paddingHorizontal: space.xs }} />
            </View>
          );
        })}

        {canAdd ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add a photo, ${total} of ${MAX_PHOTOS} used`}
            accessibilityHint="Opens your photo library"
            onPress={() => void add()}
            style={({ pressed }) => [{
              width: TILE, height: TILE, minHeight: TOUCH_TARGET, ...bubbleShape(TILE), borderWidth: 1.5, borderStyle: "dashed",
              borderColor: colors.primary, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface,
            }, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="camera-outline" size={28} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 14, fontFamily: fonts.bold }}>Add</Text>
          </Pressable>
        ) : null}
      </View>

      {saving ? <Text style={styles.hint} accessibilityLiveRegion="polite">Saving photos…</Text> : null}
      <ErrorNotice message={notice ?? mainProblem} />
    </View>
  );
}
