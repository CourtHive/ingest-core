/**
 * The sanction POLICY layer — what a governing body permits.
 *
 * CODES (`tods-competition-factory`) models the sanction *instance*: the decision a body made about
 * one competition. This layer models the *rulebook that produced it* — the levels a body defines,
 * what each permits, and which of those permissions a downstream organiser may not override.
 *
 * It lives in ingest rather than CODES deliberately: this is where source evidence lands, so the
 * constraint machinery can be exercised against real data before anything is canonicalised. Nothing
 * here is a published standard yet.
 *
 * ## Why constraints rather than a locked-field list
 *
 * Some source systems express override control as a `lockedProperties: string[]` — a list of field
 * names an organiser may not change. That shape cannot express the rules governing bodies actually
 * write. Consider a rule of the form:
 *
 *   "An association's sanction fee may not exceed two-thirds (2/3) of the national-office fee."
 *
 * That fee is neither locked nor free. A locked-name list has no way to say it. Nor can it express
 * three different deadlines on one field with three different consequences, or a national body that
 * *delegates* a deadline downward rather than setting or locking it.
 *
 * Every comparable system surveyed puts override control ON THE FIELD rather than in a side list —
 * Firefox (`Status: default|locked|user|clear`), Chrome (`can_be_mandatory` / `can_be_recommended`
 * plus a per-field JSON subschema), AWS Organizations (`@@operators_allowed_for_child_policies`),
 * Kubernetes `LimitRange` (`min`/`max`/`default`/`defaultRequest`), YANG (`refine`/`deviate` over a
 * closed property set). The one out-of-band mechanism, Windows Group Policy's `Enforced`, is
 * whole-object rather than per-field, and Microsoft's own documentation says to use it sparingly.
 *
 * The import direction also favours constraints: a locked-name list converts to constraints
 * losslessly and mechanically (`'headTax' ∈ lockedProperties` → `{ overridable: false }`), while
 * the reverse is lossy — `{ max: 12 }` has no locked-list representation.
 */

/** How a child policy may alter an inherited value. Mirrors AWS Organizations' operator set. */
export type ConstraintMergeRule =
  /** the child replaces the inherited value */
  | 'REPLACE'
  /** the child may add to, but not remove from, the inherited value (multi-valued only) */
  | 'APPEND'
  /** the effective value is the intersection of ancestor and child (multi-valued only) */
  | 'INTERSECT'
  /** the child may not alter it at all */
  | 'NONE';

/** How hard a violation bites. Three independent policy systems converged on these three values. */
export type ConstraintEnforcement = 'ENFORCE' | 'AUDIT' | 'WARN';

/**
 * A bound expressed relative to another field, typically an ancestor's value.
 *
 * Exists for rules like an association fee capped at a fraction of the national fee, which
 * are common in federated fee schedules and inexpressible as either a lock or a literal bound.
 */
export interface RelativeBound {
  /** dot-path to the field this bound is relative to, resolved against the ancestor policy */
  field: string;
  comparator: 'LTE' | 'GTE' | 'EQ';
  /** multiplier applied to the referenced value — 0.667 for "two-thirds of" */
  factor?: number;
  /** absolute offset applied after the factor */
  offset?: number;
}

/**
 * What an authority permits for one field.
 *
 * **Absent constraint means unconstrained.** Never emit an empty constraint for every field —
 * that multiplies document size for no information, and it destroys the distinction Group Policy
 * calls `Not Configured` (which is not the same as `false`).
 *
 * `default` and the validation keys are deliberately separate, following `LimitRange`: defaulting
 * MUTATES a submission, validation REJECTS it, and they must run in that order. Collapsing them is
 * how you ship a default that violates the same policy's own maximum.
 */
export interface FieldConstraint {
  /**
   * Whether a downstream organiser may set this field at all.
   *
   * Kept as a first-class key rather than emulated by a singleton `allowedValues`, because the
   * common federation semantic is "locked to whatever the parent chose, value unstated here" —
   * which has no value to collapse into. Constraints generalise locks; they do not replace them.
   */
  overridable?: boolean;
  /** the closed set of permitted values */
  allowedValues?: (string | number | boolean)[];
  /** exact required value — used for mandated literal text a body requires verbatim */
  const?: string | number | boolean;
  minimum?: number;
  maximum?: number;
  /** bound relative to an ancestor's value */
  relative?: RelativeBound;
  /** what the field becomes when the organiser leaves it unset — mutates, does not validate */
  default?: unknown;
  /** the organiser MUST supply a value */
  required?: boolean;
  /**
   * The authority declines to set this and requires a named descendant tier to set it instead.
   * A rule of the form "a named regional tier shall establish submission deadlines" is exactly this.
   */
  delegatedTo?: string;
  merge?: ConstraintMergeRule;
  enforcement?: ConstraintEnforcement;
  /** why this constraint exists — a rule citation, kept so effective policy stays explainable */
  citation?: string;
}

/** One level/grade/permit class an authority defines. */
export interface SanctionLevel {
  levelId: string;
  name: string;
  shortName?: string;
  /** the authority's own ordering; lower is not universally more prestigious, so do not assume */
  orderIndex?: number;
  /** ADULT | JUNIOR | … as the authority names it */
  category?: string;
  /** which recognition this level confers, in CODES terms */
  recognition?: string;
  /** results at this level count toward the authority's ranking lists */
  rankingEligible?: boolean;
  /** per-field constraints. Absent key ⇒ unconstrained. */
  constraints?: Record<string, FieldConstraint>;
  /** free-form authority-specific detail that has no canonical home yet */
  extensions?: Record<string, unknown>;
}

/**
 * A governing body's rulebook, pinned to an edition.
 *
 * `parentPolicyId` is what makes the hierarchy real: a section policy names the national policy it
 * descends from, and effective policy is computed down that chain.
 */
export interface SanctionPolicy {
  policyId: string;
  /** the body this policy belongs to */
  authorityId: string;
  authorityName?: string;
  /** e.g. '2026' — rulebooks are annual and a sanction is granted under one edition */
  edition: string;
  /** the policy this one descends from, if any */
  parentPolicyId?: string;
  levels: SanctionLevel[];
  /** constraints applying to every level in this policy */
  constraints?: Record<string, FieldConstraint>;
  extensions?: Record<string, unknown>;
}

/** A problem found while resolving or validating against a policy. */
export interface PolicyIssue {
  /** dot-path of the offending field */
  field: string;
  code:
    | 'NOT_OVERRIDABLE'
    | 'NOT_ALLOWED_VALUE'
    | 'BELOW_MINIMUM'
    | 'ABOVE_MAXIMUM'
    | 'RELATIVE_BOUND_EXCEEDED'
    | 'CONST_MISMATCH'
    | 'REQUIRED_MISSING'
    | 'UNRESOLVED_RELATIVE_BOUND'
    | 'DELEGATED_NOT_SET';
  message: string;
  enforcement: ConstraintEnforcement;
  citation?: string;
}

/** The outcome of validating an organiser's choices against an effective policy. */
export interface PolicyEvaluation {
  /** true when no ENFORCE-level issue was found. AUDIT and WARN issues do not block. */
  valid: boolean;
  /** the organiser's values with policy defaults applied */
  effectiveValues: Record<string, unknown>;
  issues: PolicyIssue[];
}
