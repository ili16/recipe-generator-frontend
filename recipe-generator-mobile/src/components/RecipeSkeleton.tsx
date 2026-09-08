import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing, ScrollView } from 'react-native';
import { useTheme, Theme } from '../context/ThemeContext';
import { RecipeDocument } from '../types';

interface Props {
  visible: boolean;
  doc: Partial<RecipeDocument> | null;
  message?: string;
}

const PLACEHOLDER_ROWS = 5;

// Loading screen shown while POST /generate(/stream) is in flight: grey shimmer bars
// that resolve into real text/rows as fields arrive on `doc` (populated live on web via
// the streaming endpoint; stays null throughout on native/non-streaming fallback, so it
// just shimmers until the single response lands).
const RecipeSkeleton: React.FC<Props> = ({ visible, doc, message }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });

  const Bar = ({ width, height = 14, style }: { width: number | `${number}%`; height?: number; style?: object }) => (
    <Animated.View style={[styles.bar, { width, height, opacity }, style]} />
  );

  const ingredients = doc?.ingredients ?? [];
  const steps = doc?.steps ?? [];
  const hasMeta = doc?.servings != null || (doc?.prep_minutes ?? 0) + (doc?.cook_minutes ?? 0) > 0 || doc?.difficulty != null;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.container}>
        <View style={styles.sheet}>
          {message && <Text style={styles.message}>{message}</Text>}

          <ScrollView showsVerticalScrollIndicator={false}>
            {doc?.title ? (
              <Text style={styles.title} numberOfLines={2}>{doc.title}</Text>
            ) : (
              <Bar width="70%" height={22} style={styles.titleBarSpacing} />
            )}

            {hasMeta ? (
              <View style={styles.metaRow}>
                {doc?.servings != null && <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>🍽 {doc.servings} servings</Text></View>}
                {((doc?.prep_minutes ?? 0) + (doc?.cook_minutes ?? 0)) > 0 && (
                  <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>⏱ {(doc?.prep_minutes ?? 0) + (doc?.cook_minutes ?? 0)} min</Text></View>
                )}
                {doc?.difficulty != null && <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>{doc.difficulty}</Text></View>}
              </View>
            ) : (
              <View style={styles.metaRow}>
                <Bar width={90} height={22} style={styles.pillBar} />
                <Bar width={70} height={22} style={styles.pillBar} />
              </View>
            )}

            {doc?.summary ? (
              <Text style={styles.summary}>{doc.summary}</Text>
            ) : (
              <>
                <Bar width="100%" style={styles.lineSpacing} />
                <Bar width="80%" style={styles.lineSpacing} />
              </>
            )}

            <Text style={styles.sectionLabel}>Ingredients</Text>
            {ingredients.length > 0
              ? ingredients.map((ing, idx) => (
                  <View key={idx} style={styles.row}>
                    <View style={styles.bullet} />
                    {ing?.item ? <Text style={styles.rowText}>{ing.item}</Text> : <Bar width="60%" />}
                  </View>
                ))
              : Array.from({ length: PLACEHOLDER_ROWS }).map((_, idx) => (
                  <View key={idx} style={styles.row}>
                    <View style={styles.bullet} />
                    <Bar width={`${75 - idx * 5}%` as `${number}%`} />
                  </View>
                ))}

            <Text style={styles.sectionLabel}>Steps</Text>
            {steps.length > 0
              ? steps.map((s, idx) => (
                  <View key={idx} style={styles.row}>
                    <View style={styles.stepNum}><Text style={styles.stepNumText}>{s?.sort_order ?? idx + 1}</Text></View>
                    {s?.step_text ? <Text style={styles.rowText}>{s.step_text}</Text> : <Bar width="85%" />}
                  </View>
                ))
              : Array.from({ length: 4 }).map((_, idx) => (
                  <View key={idx} style={styles.row}>
                    <View style={styles.stepNum}><Text style={styles.stepNumText}>{idx + 1}</Text></View>
                    <Bar width={`${85 - idx * 8}%` as `${number}%`} />
                  </View>
                ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', padding: 20 },
    sheet: { backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.border, maxHeight: '85%', padding: 20 },
    message: { fontSize: 14, color: t.accent, marginBottom: 12, fontWeight: '600' },
    title: { fontSize: 22, fontWeight: '700', color: t.text, marginBottom: 12 },
    titleBarSpacing: { marginBottom: 12, borderRadius: 6 },
    bar: { backgroundColor: t.card, borderRadius: 4 },
    lineSpacing: { marginBottom: 8, borderRadius: 4 },
    metaRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    metaBadge: { backgroundColor: t.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    metaBadgeText: { fontSize: 12, color: t.subtext },
    pillBar: { borderRadius: 12 },
    summary: { fontSize: 14, color: t.subtext, marginBottom: 16, lineHeight: 20 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: t.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
    bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent },
    rowText: { flex: 1, fontSize: 14, color: t.text },
    stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' },
    stepNumText: { fontSize: 12, fontWeight: '700', color: t.subtext },
  });

export default RecipeSkeleton;
