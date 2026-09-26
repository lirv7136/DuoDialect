/**
 * Profile photos for display. A round avatar for the main photo wherever a name appears,
 * and a strip of every photo on a person's profile. With no photo, or while a photo is
 * unavailable, a neutral initials circle stands in. Images are cached in memory and on
 * disk by expo-image, keyed by the Storage path rather than the download URL, so a photo
 * is fetched once. Every image carries a label such as "Aiko’s photo 1 of 3".
 */
import { ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { usePhotoUrl } from "../hooks/use-photo-url";
import { initialsFor, photoLabel, sanitizePhotos, type ProfilePhoto } from "../src/domain/photos";
import { colors, space } from "../constants/theme";

function Initials({ name, size, label }: { name: string; size: number; label: string }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{
        width: size, height: size, borderRadius: size / 2, backgroundColor: colors.pale,
        borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.green, fontWeight: "700", fontSize: Math.max(12, Math.round(size * 0.38)) }} allowFontScaling={false}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}

function StoredImage({ path, label, width, height, radius, name }: {
  path: string; label: string; width: number; height: number; radius: number; name: string;
}) {
  const url = usePhotoUrl(path);
  if (!url) {
    return radius >= width / 2
      ? <Initials name={name} size={width} label={label} />
      : <View accessible accessibilityRole="image" accessibilityLabel={label}
          style={{ width, height, borderRadius: radius, backgroundColor: colors.pale }} />;
  }
  return (
    <Image
      source={{ uri: url, cacheKey: path }}
      cachePolicy="memory-disk"
      recyclingKey={path}
      contentFit="cover"
      transition={150}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width, height, borderRadius: radius, backgroundColor: colors.pale }}
    />
  );
}

/** The main photo as a circle, or initials. `photos` is the person's full ordered list. */
export function Avatar({ name, photos, size = 48 }: { name: string; photos?: ProfilePhoto[] | null; size?: number }) {
  const list = sanitizePhotos(photos);
  const main = list[0];
  if (!main) return <Initials name={name} size={size} label={`${name || "Member"}, no photo`} />;
  return <StoredImage path={main.path} name={name} label={photoLabel(name, 0, list.length)} width={size} height={size} radius={size / 2} />;
}

/** Every photo, main first, in a horizontal row. Renders an initials avatar when there are none. */
export function PhotoStrip({ name, photos, size = 200 }: { name: string; photos?: ProfilePhoto[] | null; size?: number }) {
  const list = sanitizePhotos(photos);
  if (list.length === 0) return <Avatar name={name} photos={list} size={96} />;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
      {list.map((photo, index) => (
        <StoredImage key={photo.id} path={photo.path} name={name} label={photoLabel(name, index, list.length)}
          width={size} height={size} radius={14} />
      ))}
    </ScrollView>
  );
}

/** A local file (a new upload's preview) or a stored photo, as a rounded square. */
export function PhotoTile({ localUri, path, label, size }: { localUri: string | null; path: string | null; label: string; size: number }) {
  if (localUri) {
    return (
      <Image source={{ uri: localUri }} contentFit="cover" accessible accessibilityRole="image" accessibilityLabel={label}
        style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.pale }} />
    );
  }
  if (path) return <StoredImage path={path} name="" label={label} width={size} height={size} radius={12} />;
  return <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.pale }} />;
}
