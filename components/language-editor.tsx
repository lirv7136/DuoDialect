import { Text, View } from "react-native";
import type { LanguageLevel, UserLang } from "../src/domain/language-exchange";
import { LANGUAGE_LEVELS, LIMITS, SUGGESTED_LANGUAGES, capitalise } from "../src/domain/profile-form";
import { normalizeLanguage } from "../src/domain/language-exchange";
import { Button, Card, Chip, ChipRow, Field, styles } from "./ui";

type Props = {
  title: string;
  hint: string;
  value: UserLang[];
  onChange: (next: UserLang[]) => void;
  levels?: LanguageLevel[];
  defaultLevel: LanguageLevel;
};

/** Edit one list of languages, each with a self declared proficiency. */
export function LanguageEditor({ title, hint, value, onChange, levels = LANGUAGE_LEVELS, defaultLevel }: Props) {
  const listed = new Set(value.map(item => normalizeLanguage(item.lang)));
  const suggestions = SUGGESTED_LANGUAGES.filter(lang => !listed.has(normalizeLanguage(lang)));
  const full = value.length >= LIMITS.languages;

  const update = (index: number, patch: Partial<UserLang>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={styles.label}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      {value.map((item, index) => (
        <Card key={index}>
          <Field
            label={`Language ${index + 1}`}
            value={item.lang}
            onChangeText={lang => update(index, { lang })}
            maxLength={LIMITS.language}
            autoCapitalize="words"
            placeholder="e.g. Japanese"
          />
          <Text style={styles.hint}>Level</Text>
          <ChipRow>
            {levels.map(level => (
              <Chip
                key={level}
                role="radio"
                label={capitalise(level)}
                accessibilityLabel={`${item.lang || `Language ${index + 1}`}: ${level}`}
                selected={item.level === level}
                onPress={() => update(index, { level })}
              />
            ))}
          </ChipRow>
          <Button
            variant="ghost"
            label="Remove"
            accessibilityLabel={`Remove ${item.lang || `language ${index + 1}`}`}
            onPress={() => onChange(value.filter((_, i) => i !== index))}
          />
        </Card>
      ))}
      {!full ? (
        <>
          {suggestions.length ? (
            <ChipRow>
              {suggestions.map(lang => (
                <Chip
                  key={lang}
                  label={`+ ${lang}`}
                  accessibilityLabel={`Add ${lang}`}
                  selected={false}
                  onPress={() => onChange([...value, { lang, level: defaultLevel }])}
                />
              ))}
            </ChipRow>
          ) : null}
          <Button label="Add another language" onPress={() => onChange([...value, { lang: "", level: defaultLevel }])} />
        </>
      ) : <Text style={styles.hint}>{`Up to ${LIMITS.languages} languages.`}</Text>}
    </View>
  );
}
