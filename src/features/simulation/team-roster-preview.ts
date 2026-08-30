/**
 * Re-export shared roster preview helpers (arch-review Sprint A).
 * Non-workspace features must import from `@/lib/team-roster-preview`.
 */
export type {
  TeamRosterMemberPreview,
  TeamRosterPreview,
} from "@/lib/team-roster-preview";
export {
  rosterToPreview,
  teamMemberPreview,
} from "@/lib/team-roster-preview";
