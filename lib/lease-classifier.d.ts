// Types for lease-classifier.mjs (standalone CSLC lease classifier).
export type KindKey = "cable" | "pipeline" | "outfall" | "power";
export type CategoryKey = "infra" | "roads" | "shore" | "rec" | "agency" | "commercial" | "other";
export type Kind = { key: KindKey; label: string; word: string };
export type Category = { key: CategoryKey; label: string; reason: string };

export const CLASSIFIER_VERSION: string;
export const KIND_RULES: { key: KindKey; label: string; strong: RegExp; weak: RegExp | null }[];
export const KIND_LABELS: Record<KindKey | "other", string>;
export const WEAK_OK: RegExp;
export const MARINA: RegExp;
export const ROAD: RegExp;
export const CATEGORIES: { key: CategoryKey; label: string }[];
export const CATEGORY_OF_LEASE_TYPE: Record<string, CategoryKey>;
export const METHODS: { kinds: string; category: string };

export function infraKinds(improvements: string | null | undefined, typeOfLease: string | null | undefined): Kind[];
export function categoryOf(typeOfLease: string | null | undefined, improvements: string | null | undefined, kinds?: Kind[]): Category;
export function classifyLease(lease: { typeOfLease: string | null | undefined; improvements: string | null | undefined }): {
  category: Category;
  kinds: Kind[];
  primary: Kind | null;
};
