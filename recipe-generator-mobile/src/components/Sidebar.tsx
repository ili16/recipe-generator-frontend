import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../context/ThemeContext';
import { NAV_ITEMS, PROFILE_NAV_ITEM, NavItem } from '../navigation/navItems';
import { RootStackParamList } from '../navigation/AppNavigator';

interface Props {
  activeRoute: string;
  onNavigate: (route: keyof RootStackParamList) => void;
  variant: 'rail' | 'drawer';
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const Sidebar: React.FC<Props> = ({ activeRoute, onNavigate, variant, onClose, collapsed = false, onToggleCollapse }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const renderItem = (item: NavItem) => {
    const active = item.route === activeRoute;
    if (!item.route) {
      return (
        <View key={item.key} style={[styles.item, collapsed && styles.itemCollapsed]}>
          <Ionicons name={item.icon} size={19} color={theme.muted} style={[!collapsed && styles.itemIcon]} />
          {!collapsed && <Text style={styles.itemLabelDisabled} numberOfLines={1}>{item.label}</Text>}
          {!collapsed && <View style={styles.soonPill}><Text style={styles.soonPillText}>Soon</Text></View>}
        </View>
      );
    }
    return (
      <TouchableOpacity
        key={item.key}
        style={[styles.item, collapsed && styles.itemCollapsed, active && styles.itemActive]}
        onPress={() => onNavigate(item.route!)}
      >
        <Ionicons name={item.icon} size={19} color={active ? theme.accent : theme.subtext} style={[!collapsed && styles.itemIcon]} />
        {!collapsed && <Text style={[styles.itemLabel, active && styles.itemLabelActive]} numberOfLines={1}>{item.label}</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[variant === 'rail' ? styles.rail : styles.drawer, collapsed && styles.railCollapsed]}>
      <View style={[styles.topRow, collapsed && styles.topRowCollapsed]}>
        {!collapsed && <Text style={styles.logo}>RecipeGenerator</Text>}
        {variant === 'rail' && (
          <TouchableOpacity onPress={onToggleCollapse} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={collapsed ? 'chevron-forward' : 'chevron-back'} size={18} color={theme.subtext} />
          </TouchableOpacity>
        )}
        {variant === 'drawer' && (
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={theme.subtext} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.list}>
        {NAV_ITEMS.map(renderItem)}
      </View>
      <View style={styles.footer}>
        {renderItem(PROFILE_NAV_ITEM)}
      </View>
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  rail: {
    width: 240,
    backgroundColor: t.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.hairline,
    paddingTop: 24,
    paddingHorizontal: 12,
  },
  railCollapsed: {
    width: 64,
    paddingHorizontal: 8,
  },
  drawer: {
    width: 260,
    height: '100%',
    backgroundColor: t.surface,
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingHorizontal: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.hairline,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  topRowCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  logo: {
    fontSize: 16,
    fontWeight: '700',
    color: t.text,
  },
  list: {
    gap: 2,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.hairline,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  itemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  itemActive: {
    backgroundColor: t.accentFaded,
  },
  itemIcon: {
    marginRight: 10,
  },
  itemLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: t.subtext,
    flex: 1,
  },
  itemLabelActive: {
    color: t.accent,
    fontWeight: '700',
  },
  itemLabelDisabled: {
    fontSize: 14,
    fontWeight: '500',
    color: t.muted,
    flex: 1,
  },
  soonPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: t.border,
  },
  soonPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: t.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});

export default Sidebar;
