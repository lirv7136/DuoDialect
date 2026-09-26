import { useState } from "react";
import { Text, View } from "react-native";
import type { LanguageLevel, UserLang } from "../src/domain/language-exchange";
import { LIMITS, TEACHING_LEVELS, capitalise } from "../src/domain/profile-form";
import { normalizeLanguage } from "../src/domain/language-exchange";
import { LANGUAGES, POPULAR_LANGUAGES, displayLanguage, isListedLanguage, searchLanguages } from "../src/domain/languages";
import { Button, Card, Chip, ChipRow, Field, Heading, styles } from "./ui";

type Props = {
  title: string;
  hint: string;
  value: UserLang[];
  onChange: (next: UserLang[]) => void;
  /** Defaults to native and fluent: the only levels that can be offered to a partner. */
  levels?: LanguageLevel[];
  defaultLevel: LanguageLevel;
};

/** Edit one list of languages, each with a self declared proficiency. */
export function LanguageEditor({ title, hint, value, onChange, levels = TEACHING_LEVELS, defaultLevel }: Props) {
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const listed = value.map(item => normalizeLanguage(item.lang));
  const full = value.length >= LIMITS.languages;
  const typed = query.trim();
  const matches = searchLanguages(typed, listed);
  const shown = typed || browsing
    ? matches
    : matches.filter(option => POPULAR_LANGUAGES.includes(option.name));
  const exact = !!typed && LANGUAGES.some(option => normalizeLanguage(option.name) === normalizeLanguage(typed));
  const alreadyListed = !!typed && listed.includes(normalizeLanguage(typed));

  const update = (index: number, patch: Partial<UserLang>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const add = (lang: string) => {
    onChange([...value, { lang, level: defaultLevel }]);
    setQuery("");
    setBrowsing(false);
  };

  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={styles.label}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      {value.map((item, index) => {
        const name = item.lang.trim() ? displayLanguage(item.lang) : `Language ${index + 1}`;
        // A level saved before this list was narrowed stays visible so it can be changed.
        const choices = levels.includes(item.level) ? levels : [...levels, item.level];
        return (
          <Card key={index}>
            {isListedLanguage(item.lang) ? <Heading>{name}</Heading> : (
              <Field
                label={`Language ${index + 1}`}
                value={item.lang}
                onChangeText={lang => update(index, { lang })}
                maxLength={LIMITS.language}
                autoCapitalize="words"
                placeholder="e.g. Xhosa"
              />
            )}
            <Text style={styles.hint}>Level</Text>
            <ChipRow>
              {choices.map(level => (
                <Chip
                  key={level}
                  role="radio"
                  label={capitalise(level)}
                  accessibilityLabel={`${name}: ${level}`}
                  selected={item.level === level}
                  onPress={() => update(index, { level })}
                />
              ))}
            </ChipRow>
            <Button
              variant="ghost"
              label="Remove"
              accessibilityLabel={`Remove ${name}`}
              onPress={() => onChange(value.filter((_, i) => i !== index))}
            />
          </Card>
        );
      })}
      {!full ? (
        <>
          <Field
            label={value.length ? "Add another language" : "Add a language"}
            value={query}
            onChangeText={setQuery}
            maxLength={LIMITS.language}
            autoCapitalize="words"
            autoCorrect={false}
            placeholder="Search, e.g. Japanese"
            returnKeyType="search"
          />
          {shown.length ? (
            <ChipRow>
              {shown.map(option => (
                <Chip
                  key={option.name}
                  label={`+ ${option.name}`}
                  accessibilityLabel={`Add ${option.name}`}
                  selected={false}
                  onPress={() => add(option.name)}
                />
              ))}
            </ChipRow>
          ) : null}
          {typed && !exact && !alreadyListed ? (
            <Button label={`Add “${typed}”`} hint="Adds a language that isn’t in the list" onPress={() => add(typed)} />
          ) : null}
          {alreadyListed ? <Text style={styles.hint}>{`${displayLanguage(typed)} is already listed.`}</Text> : null}
          {!typed ? (
            <Button
              variant="ghost"
              label={browsing ? "Show fewer languages" : `Browse all ${LANGUAGES.length} languages`}
              onPress={() => setBrowsing(current => !current)}
            />
          ) : null}
          {!typed ? <Text style={styles.hint}>Not listed? Type its name above to add it.</Text> : null}
        </>
      ) : <Text style={styles.hint}>{`Up to ${LIMITS.languages} languages.`}</Text>}
    </View>
  );
}
