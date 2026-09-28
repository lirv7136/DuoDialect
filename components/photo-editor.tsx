/**
 * The profile photo row: up to three slots, add, remove and make main. Driven by
 * usePhotoEditor, which owns the upload, screening and saving. Every control keeps a 48dp
 * touch target and says which photo it acts on.
 */
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { usePhotoEditor } from "../hooks/use-photo-editor";
import { MAX_PHOTOS, slotStatusLabel } from "../src/domain/photos";
import { Button, ErrorNotice, styles } from "./ui";
import { PhotoTile } from "./avatar";
import { colors, space, TOUCH_TARGET } from "../constants/theme";

const TILE = 104;

export function PhotoEditor({ editor }: { editor: ReturnType<typeof usePhotoEditor> }) {
  const { slots, notice, saving, canAdd, add, remove, makeMain } = editor;
  const total = slots.length;

  return (
    <View style={{ gap: space.sm }}>
      <Text accessibilityRole="header" style={styles.label}>Photos (optional)</Text>
      <Text style={styles.hint}>
        {`Up to ${MAX_PHOTOS}. A clear photo of you helps language partners recognise you when you meet. The first is your main photo. Each photo is checked automatically before anyone else can see it.`}
      </Text>

      <View style={[styles.row, { alignItems: "flex-start" }]}>
        {slots.map((slot, index) => {
          const status = slotStatusLabel(slot);
          const label = `Your photo ${index + 1} of ${total}${index === 0 ? ", main photo" : ""}${status ? `, ${status}` : ""}`;
          return (
            <View key={slot.id} style={{ width: TILE, gap: space.xs }}>
              <View>
                <PhotoTile localUri={slot.localUri} path={slot.path} label={label} size={TILE} />
                {status ? (
                  <View
                    accessibilityLiveRegion="polite"
                    style={{
                      position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 12,
                      backgroundColor: "rgba(31, 58, 95, 0.6)", alignItems: "center", justifyContent: "center", gap: 4, padding: 4,
                    }}
                  >
                    <ActivityIndicator color={colors.onPrimary} />
                    <Text style={{ color: colors.onPrimary, fontSize: 13, fontWeight: "700", textAlign: "center" }}>{status}</Text>
                  </View>
                ) : null}
                {index === 0 && !status ? (
                  <View style={{ position: "absolute", left: 6, top: 6, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: "700" }}>Main</Text>
                  </View>
                ) : null}
              </View>
              {index > 0 && slot.status === "ready" ? (
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
              width: TILE, height: TILE, minHeight: TOUCH_TARGET, borderRadius: 12, borderWidth: 1, borderStyle: "dashed",
              borderColor: colors.primary, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface,
            }, pressed && { opacity: 0.8 }]}
          >
            <Text style={{ color: colors.primary, fontSize: 28, fontWeight: "700" }} allowFontScaling={false}>+</Text>
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "700" }}>Add photo</Text>
          </Pressable>
        ) : null}
      </View>

      {saving ? <Text style={styles.hint} accessibilityLiveRegion="polite">Saving photos…</Text> : null}
      <ErrorNotice message={notice} />
    </View>
  );
}
