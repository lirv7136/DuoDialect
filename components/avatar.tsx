/**
 * Profile photos for display, in the speech-bubble mask: rounded 24 on three corners and
 * 6 on the bottom left, scaled down for small avatars. With no photo, or while a photo is
 * unavailable, initials stand in. Images are cached in memory and on disk by expo-image,
 * keyed by the Storage path rather than the download URL, so a photo is fetched once.
 * Every image carries a label such as "Aiko’s photo 1 of 3".
 */
import { ScrollView, Text, View, type DimensionValue, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { usePhotoUrl } from "../hooks/use-photo-url";
import { initialsFor, photoLabel, sanitizePhotos, type ProfilePhoto } from "../src/domain/photos";
import { colors, fonts, radius, space } from "../constants/theme";

/** The bubble corners for a shape `size` points across. */
export function bubbleShape(size: number): ViewStyle {
  const round = Math.min(radius.bubble, size / 2);
  const tail = Math.max(3, Math.round(radius.bubbleTail * Math.min(1, size / 48)));
  return { borderRadius: round, borderBottomLeftRadius: tail, overflow: "hidden" };
}

function Initials({ name, size, label }: { name: string; size: number; label: string }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[bubbleShape(size), { width: size, height: size, backgroundColor: colors.surfaceNavySoft, alignItems: "center", justifyContent: "center" }]}
    >
      <Text style={{ color: colors.primary, fontFamily: fonts.display, fontSize: Math.max(12, Math.round(size * 0.4)) }} allowFontScaling={false}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}

function StoredImage({ path, label, width, height, name, shapeSize, aspectRatio }: {
  path: string; label: string; width: DimensionValue; height?: DimensionValue; name: string; shapeSize: number; aspectRatio?: number;
}) {
  const url = usePhotoUrl(path);
  const frame: ViewStyle = { width, height, aspectRatio, backgroundColor: colors.surfaceNavySoft, ...bubbleShape(shapeSize) };
  if (!url) {
    return typeof width === "number" && width <= 96
      ? <Initials name={name} size={width} label={label} />
      : <View accessible accessibilityRole="image" accessibilityLabel={label} style={frame} />;
  }
  return (
    <View style={frame}>
      <Image
        source={{ uri: url, cacheKey: path }}
        cachePolicy="memory-disk"
        recyclingKey={path}
        contentFit="cover"
        transition={150}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}

/** The main photo in a bubble, or initials. `photos` is the person's full ordered list. */
export function Avatar({ name, photos, size = 48 }: { name: string; photos?: ProfilePhoto[] | null; size?: number }) {
  const list = sanitizePhotos(photos);
  const main = list[0];
  if (!main) return <Initials name={name} size={size} label={`${name || "Member"}, no photo`} />;
  return <StoredImage path={main.path} name={name} label={photoLabel(name, 0, list.length)} width={size} height={size} shapeSize={size} />;
}

/** The main photo at full card width in a 4:5 bubble. Null when there is no photo. */
export function CardPhoto({ name, photos }: { name: string; photos?: ProfilePhoto[] | null }) {
  const list = sanitizePhotos(photos);
  const main = list[0];
  if (!main) return null;
  return <StoredImage path={main.path} name={name} label={photoLabel(name, 0, list.length)} width="100%" aspectRatio={4 / 5} shapeSize={200} />;
}

/** Every photo, main first, in a horizontal row. Renders an initials avatar when there are none. */
export function PhotoStrip({ name, photos, size = 200 }: { name: string; photos?: ProfilePhoto[] | null; size?: number }) {
  const list = sanitizePhotos(photos);
  if (list.length === 0) return <Avatar name={name} photos={list} size={96} />;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
      {list.map((photo, index) => (
        <StoredImage key={photo.id} path={photo.path} name={name} label={photoLabel(name, index, list.length)}
          width={size} height={size * 1.25} shapeSize={size} />
      ))}
    </ScrollView>
  );
}

/** A local file (a new upload's preview) or a stored photo, as a bubble tile. */
export function PhotoTile({ localUri, path, label, size }: { localUri: string | null; path: string | null; label: string; size: number }) {
  if (localUri) {
    return (
      <View style={[bubbleShape(size), { width: size, height: size, backgroundColor: colors.surfaceNavySoft }]}>
        <Image source={{ uri: localUri }} contentFit="cover" accessible accessibilityRole="image" accessibilityLabel={label}
          style={{ width: "100%", height: "100%" }} />
      </View>
    );
  }
  if (path) return <StoredImage path={path} name="" label={label} width={size} height={size} shapeSize={size} />;
  return <View style={[bubbleShape(size), { width: size, height: size, backgroundColor: colors.surfaceNavySoft }]} />;
}
