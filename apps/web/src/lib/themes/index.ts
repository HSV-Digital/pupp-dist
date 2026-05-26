import type { ThemeConfig, ThemeId } from '../theme-config';
import { brandA } from './brand-a';

export const themes: Record<ThemeId, ThemeConfig> = {
	internal: brandA,
};
