import { Weekday, UserPreferences } from '../types';

// Shared by PreferencesScreen (Profile) and WeekView's ad-hoc panel — same two
// scheduling settings, same options, in both places.
export const WEEKDAYS: Array<{ value: Weekday; label: string }> = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

export const BATCH_DAYS_OPTIONS: Array<{ value: UserPreferences['meal_plan_batch_days']; label: string }> = [
  { value: 1, label: 'Fresh every day' },
  { value: 2, label: 'Every 2 days' },
  { value: 3, label: 'Every 3 days' },
];
