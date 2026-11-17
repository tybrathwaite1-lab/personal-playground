// ─── Discovery vocabulary ─────────────────────────────────────────────
export type Mood = 'relax' | 'create' | 'explore' | 'play' | 'connect';
export type Company = 'solo' | 'partner' | 'friends';
export type Energy = 'low' | 'medium' | 'high';
export type Environment = 'home' | 'outdoors' | 'indoor' | 'online';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export type MoodFilter = Mood | 'surprise';
export type CompanyFilter = Company | 'anyone';
export type TimeFilter = 'any' | 'under30' | 'hour' | 'oneToThree' | 'halfDay' | 'fullDay';
export type BudgetFilter = 'any' | 'free' | 'u25' | 'u50' | 'u100' | 'u200';
export type EnergyFilter = Energy | 'any';
export type EnvironmentFilter = Environment | 'anywhere';

export interface DiscoveryFilters {
  mood: MoodFilter;
  company: CompanyFilter;
  time: TimeFilter;
  budget: BudgetFilter;
  energy: EnergyFilter;
  environment: EnvironmentFilter;
}

export interface Range {
  min: number;
  max: number;
}

export interface Link {
  label: string;
  url: string;
}

// ─── Content ─────────────────────────────────────────────────────────
export interface Experience {
  id: string;
  name: string;
  /** Short Japanese or editorial kicker, purely decorative. */
  kicker?: string;
  description: string;
  activities: string[];
  /** Approximate cost in USD for one person. */
  cost: Range;
  /** Approximate duration in minutes. */
  duration: Range;
  energy: Energy;
  moods: Mood[];
  company: Company[];
  environments: Environment[];
  interests: string[];
  links?: Link[];
  /** When in the day it works best. Omit for "any time". Used by Plan a Day. */
  when?: TimeOfDay[];
  /** Ids of Local Playground places that pair well. */
  placeIds?: string[];
  custom?: boolean;
}

export type InterestCategory =
  | 'established'
  | 'curiosity'
  | 'rediscovery'
  | 'conditional'
  | 'autopilot';

export interface Interest {
  id: string;
  name: string;
  category: InterestCategory;
  /** Sub-grouping within a category (e.g. "Art and culture"). */
  group?: string;
  note?: string;
}

export type PlaceCategory =
  | 'Record stores'
  | 'Comic book shops'
  | 'Trading card shops'
  | 'Retro gaming stores'
  | 'Arcades'
  | 'Fighting game tournaments'
  | 'Tabletop gaming communities'
  | 'Skate shops and skateparks'
  | 'Basketball courts'
  | 'Street art and murals'
  | 'Art galleries'
  | 'Museums and local history'
  | 'Independent live music venues'
  | 'Makerspaces'
  | 'Electronics and DIY resources'
  | 'Archery facilities'
  | 'Tea houses and cafés'
  | 'Float therapy'
  | 'Sauna and recovery studios'
  | 'Scenic walks'
  | 'Waterfront destinations'
  | 'Plant shops'
  | 'Interesting public spaces'
  | 'Cultural events'
  | 'Workshops and classes'
  | 'Wildcard activities';

/**
 * verified    — address/website confirmed against a published source on `verifiedOn`.
 * check       — real place, but some detail (address number, current status) still needs confirming.
 * placeholder — a slot to fill in yourself; no specific business is claimed.
 */
export type VerificationStatus = 'verified' | 'check' | 'placeholder';

export interface Place {
  id: string;
  name: string;
  categories: PlaceCategory[];
  description: string;
  address?: string;
  neighborhood: string;
  city: string;
  website?: string;
  /** Free-text cost note, e.g. "Free", "$18 adult admission". */
  costNote?: string;
  /** Rough budget bucket used by filters. */
  budget: 'free' | 'low' | 'mid' | 'high' | 'unknown';
  interests: string[];
  status: VerificationStatus;
  verifiedOn?: string;
  sourceNote?: string;
  custom?: boolean;
}

export type WebsiteCategory =
  | 'Music'
  | 'Art and design'
  | 'Internet exploration'
  | 'Gaming'
  | 'History'
  | 'Technology'
  | 'DIY'
  | 'Cultural discoveries';

export interface Website {
  id: string;
  name: string;
  url: string;
  category: WebsiteCategory;
  description: string;
  tags?: string[];
  custom?: boolean;
}

export interface CuratedEdition {
  id: string;
  number: string;
  title: string;
  jp: string;
  tagline: string;
  description: string;
  sequence: string[];
  experienceIds: string[];
  accent: 'rust' | 'hunter' | 'paper';
}

// ─── Personal data ───────────────────────────────────────────────────
export type SavedKind = 'experience' | 'place' | 'website' | 'interest' | 'discovery' | 'plan' | 'event' | 'community' | 'drop';

export interface SavedItem {
  id: string;
  kind: SavedKind;
  refId: string;
  title: string;
  subtitle?: string;
  note?: string;
  url?: string;
  savedAt: string;
}

export type FieldNoteCategory =
  | 'Place'
  | 'Album'
  | 'Artist'
  | 'Game'
  | 'Comics / manga'
  | 'DIY idea'
  | 'Website'
  | 'Experience'
  | 'Try again';

export interface FieldNote {
  id: string;
  title: string;
  category: FieldNoteCategory;
  notes?: string;
  url?: string;
  tags: string[];
  createdAt: string;
}

export interface PersonalData {
  version: 1;
  saved: SavedItem[];
  favorites: string[];
  placeNotes: Record<string, string>;
  customExperiences: Experience[];
  customPlaces: Place[];
  /** Websites added by the user, plus edited copies of seeded ones (same id). */
  websites: Website[];
  hiddenWebsiteIds: string[];
  /** null until the user edits interests; then the full edited list lives here. */
  interests: Interest[] | null;
  fieldNotes: FieldNote[];
  /** Private, synced reactions keyed by "<kind>:<id>" (e.g. "place:pl-weedon"). */
  feedback: Record<string, Feedback>;
  /** User-made Pick a Vibe presets. */
  customPresets: VibePreset[];
  settings: {
    showAutopilot: boolean;
    /** Nudge picks toward indoor ideas when the forecast is bad. */
    weatherAware: boolean;
    /** null = default St. Petersburg location. Rounded to ~1 km when set from the device. */
    location: { lat: number; lon: number; label: string } | null;
    /** Everyday travel radius for local discovery, in miles. */
    radiusMiles: number;
    transport: Transport;
  };
}

// ─── Phase II: feedback, presets, communities ───────────────────────
export type Transport = 'car' | 'bike' | 'transit' | 'walk';

/** Optional private reactions. Never shown as scores or counts. */
export interface Feedback {
  been?: boolean;
  want?: boolean;
  enjoyed?: boolean;
  notInterested?: boolean;
  more?: boolean;
  familiar?: boolean;
  at: string;
}

export type Familiarity = 'new' | 'mix' | 'favorites';

export interface VibePreset {
  id: string;
  name: string;
  jp?: string;
  description: string;
  filters: Partial<DiscoveryFilters>;
  /** Experiences tagged with any of these interests are preferred. */
  interests?: string[];
  /** Hard cap on cost.min (USD). */
  maxCost?: number;
  /** Duration window in minutes the experience must overlap. */
  minutes?: [number, number];
  custom?: boolean;
}

export interface CommunityRule {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** Which occurrences in the month; omit for every week. */
  nth?: (1 | 2 | 3 | 4 | 5)[];
  /** 24h "HH:MM" local time, only if published. */
  start?: string;
  end?: string;
}

export type CommunityCadence = 'weekly' | 'monthly' | 'twice-monthly' | 'irregular' | 'online';

export interface Community {
  id: string;
  name: string;
  kind: string;
  description: string;
  /** Plain-language schedule exactly as published, e.g. "Second Saturday, 5–9 PM". */
  schedule: string;
  cadence: CommunityCadence;
  /** Machine-readable recurrence for "is it on this day?" — only when the schedule is published precisely. */
  rules?: CommunityRule[];
  placeId?: string;
  venue?: string;
  address?: string;
  city: string;
  website: string;
  costNote?: string;
  interests: string[];
  company: Company[];
  status: VerificationStatus;
  verifiedOn: string;
  sourceNote: string;
}
