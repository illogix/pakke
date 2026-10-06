export const THEME_CHOICES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
export const validThemePreference = value => THEME_CHOICES.some(([key]) => key === value);
export const themePreference = value => validThemePreference(value) ? value : 'system';
