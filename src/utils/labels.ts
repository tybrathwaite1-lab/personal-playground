import type {
  BudgetFilter,
  Company,
  CompanyFilter,
  DiscoveryFilters,
  Energy,
  EnergyFilter,
  Environment,
  EnvironmentFilter,
  Mood,
  MoodFilter,
  TimeFilter,
} from '../types';

export interface Option<T extends string> {
  value: T;
  label: string;
  jp?: string;
}

export const MOOD_OPTIONS: Option<MoodFilter>[] = [
  { value: 'surprise', label: 'Surprise me', jp: '何でも' },
  { value: 'relax', label: 'Relax', jp: '休む' },
  { value: 'create', label: 'Create', jp: '作る' },
  { value: 'explore', label: 'Explore', jp: '探す' },
  { value: 'play', label: 'Play', jp: '遊ぶ' },
  { value: 'connect', label: 'Connect', jp: '繋ぐ' },
];

export const COMPANY_OPTIONS: Option<CompanyFilter>[] = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'solo', label: 'Solo' },
  { value: 'partner', label: 'Partner' },
  { value: 'friends', label: 'Friends' },
];

export const TIME_OPTIONS: Option<TimeFilter>[] = [
  { value: 'any', label: 'Any time' },
  { value: 'under30', label: 'Under 30 min' },
  { value: 'hour', label: 'Around an hour' },
  { value: 'oneToThree', label: '1–3 hours' },
  { value: 'halfDay', label: 'Half day' },
  { value: 'fullDay', label: 'Full day' },
];

export const BUDGET_OPTIONS: Option<BudgetFilter>[] = [
  { value: 'any', label: 'Any' },
  { value: 'free', label: 'Free' },
  { value: 'u25', label: 'Under $25' },
  { value: 'u50', label: 'Under $50' },
  { value: 'u100', label: 'Under $100' },
  { value: 'u200', label: 'Under $200' },
];

export const ENERGY_OPTIONS: Option<EnergyFilter>[] = [
  { value: 'any', label: 'Any' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const ENVIRONMENT_OPTIONS: Option<EnvironmentFilter>[] = [
  { value: 'anywhere', label: 'Anywhere' },
  { value: 'home', label: 'At home' },
  { value: 'outdoors', label: 'Outdoors' },
  { value: 'indoor', label: 'Indoor destination' },
  { value: 'online', label: 'Online' },
];

export const FILTER_GROUPS: {
  key: keyof DiscoveryFilters;
  title: string;
  number: string;
  options: Option<string>[];
}[] = [
  { key: 'mood', title: 'Mood', number: '01', options: MOOD_OPTIONS },
  { key: 'company', title: 'Company', number: '02', options: COMPANY_OPTIONS },
  { key: 'time', title: 'Time', number: '03', options: TIME_OPTIONS },
  { key: 'budget', title: 'Budget', number: '04', options: BUDGET_OPTIONS },
  { key: 'energy', title: 'Energy', number: '05', options: ENERGY_OPTIONS },
  { key: 'environment', title: 'Where', number: '06', options: ENVIRONMENT_OPTIONS },
];

export function optionLabel(key: keyof DiscoveryFilters, value: string): string {
  return FILTER_GROUPS.find((g) => g.key === key)?.options.find((o) => o.value === value)?.label ?? value;
}

export const MOOD_LABEL: Record<Mood, string> = {
  relax: 'Relax',
  create: 'Create',
  explore: 'Explore',
  play: 'Play',
  connect: 'Connect',
};

export const COMPANY_LABEL: Record<Company, string> = {
  solo: 'Solo',
  partner: 'Partner',
  friends: 'Friends',
};

export const ENERGY_LABEL: Record<Energy, string> = {
  low: 'Low energy',
  medium: 'Medium energy',
  high: 'High energy',
};

export const ENVIRONMENT_LABEL: Record<Environment, string> = {
  home: 'At home',
  outdoors: 'Outdoors',
  indoor: 'Indoor destination',
  online: 'Online',
};
