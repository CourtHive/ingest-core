import type {
  ConstraintEnforcement,
  PolicyEvaluation,
  FieldConstraint,
  SanctionPolicy,
  PolicyIssue,
} from './types';

/**
 * Effective-policy computation and validation.
 *
 * Two operations, deliberately separate and ordered:
 *
 *   1. `resolveConstraints` merges an ancestor chain into one effective constraint map.
 *   2. `evaluate` applies defaults (MUTATES), then validates (REJECTS), in that order.
 *
 * The ordering is not incidental. Kubernetes runs mutating admission strictly before validating
 * admission for the same reason: if you validate first, a default injected afterwards can violate
 * the very policy that just passed.
 */

/** A restriction inherited from an ancestor cannot be reversed by a descendant. */
function mergeConstraint(ancestor: FieldConstraint, child: FieldConstraint): FieldConstraint {
  // Once an ancestor says a field is not overridable, no descendant may reopen it. This is AWS
  // Organizations' ratchet ("you can't reverse that rule in a child policy") and it is the property
  // that makes a hierarchy trustworthy — without it, delegation is indistinguishable from handing
  // over control entirely.
  if (ancestor.overridable === false) return { ...ancestor };

  const merged: FieldConstraint = { ...ancestor, ...child };

  // Bounds tighten monotonically: a child may narrow the window, never widen it.
  if (ancestor.minimum !== undefined) {
    merged.minimum = child.minimum !== undefined ? Math.max(ancestor.minimum, child.minimum) : ancestor.minimum;
  }
  if (ancestor.maximum !== undefined) {
    merged.maximum = child.maximum !== undefined ? Math.min(ancestor.maximum, child.maximum) : ancestor.maximum;
  }

  // Value sets intersect unless the ancestor explicitly permits appending. `INTERSECT` is the safe
  // default because a child that could add values could grant itself permissions the parent withheld.
  if (ancestor.allowedValues) {
    if (child.allowedValues) {
      merged.allowedValues =
        ancestor.merge === 'APPEND'
          ? [...new Set([...ancestor.allowedValues, ...child.allowedValues])]
          : ancestor.allowedValues.filter((value) => child.allowedValues?.includes(value));
    } else {
      merged.allowedValues = ancestor.allowedValues;
    }
  }

  // A fixed value and a citation both belong to whoever imposed them.
  if (ancestor.const !== undefined) merged.const = ancestor.const;
  if (ancestor.citation && !child.citation) merged.citation = ancestor.citation;

  return merged;
}

/**
 * Merge an ancestor chain into one effective constraint map.
 *
 * `policies` is ordered broadest → narrowest (national, section, district). Level constraints are
 * applied after the policy's own, so a level may tighten what its policy allows.
 */
export function resolveConstraints(policies: SanctionPolicy[], levelId?: string): Record<string, FieldConstraint> {
  const effective: Record<string, FieldConstraint> = {};

  const apply = (constraints?: Record<string, FieldConstraint>) => {
    for (const [field, constraint] of Object.entries(constraints ?? {})) {
      effective[field] = effective[field] ? mergeConstraint(effective[field], constraint) : { ...constraint };
    }
  };

  for (const policy of policies) {
    apply(policy.constraints);
    if (levelId) apply(policy.levels?.find((level) => level.levelId === levelId)?.constraints);
  }

  return effective;
}

function resolveRelativeBound(
  constraint: FieldConstraint,
  context: Record<string, unknown>,
): { limit: number; comparator: 'LTE' | 'GTE' | 'EQ' } | undefined {
  const relative = constraint.relative;
  if (!relative) return undefined;
  const referenced = relative.field.split('.').reduce<any>((node, key) => node?.[key], context);
  if (typeof referenced !== 'number') return undefined;
  return { limit: referenced * (relative.factor ?? 1) + (relative.offset ?? 0), comparator: relative.comparator };
}

function checkOne(
  field: string,
  constraint: FieldConstraint,
  supplied: Record<string, unknown>,
  context: Record<string, unknown>,
): PolicyIssue[] {
  const enforcement: ConstraintEnforcement = constraint.enforcement ?? 'ENFORCE';
  const cite = constraint.citation ? { citation: constraint.citation } : {};
  const issue = (code: PolicyIssue['code'], message: string): PolicyIssue => ({
    field,
    code,
    message,
    enforcement,
    ...cite,
  });
  const issues: PolicyIssue[] = [];
  const present = Object.hasOwn(supplied, field);
  const value = supplied[field];

  if (!present) {
    if (constraint.required) issues.push(issue('REQUIRED_MISSING', `${field} is required`));
    // A delegated field the delegate never set is a real gap, not a silent pass — this is the
    // failure mode where a national body assumes a section set a deadline and nobody did.
    if (constraint.delegatedTo) {
      issues.push(issue('DELEGATED_NOT_SET', `${field} is delegated to ${constraint.delegatedTo} and was never set`));
    }
    return issues;
  }

  if (constraint.overridable === false) {
    issues.push(issue('NOT_OVERRIDABLE', `${field} may not be set downstream`));
  }
  if (constraint.const !== undefined && value !== constraint.const) {
    issues.push(issue('CONST_MISMATCH', `${field} must be exactly ${String(constraint.const)}`));
  }
  if (constraint.allowedValues && !constraint.allowedValues.includes(value as never)) {
    issues.push(issue('NOT_ALLOWED_VALUE', `${field} must be one of ${constraint.allowedValues.join(', ')}`));
  }
  if (typeof value === 'number') {
    if (constraint.minimum !== undefined && value < constraint.minimum) {
      issues.push(issue('BELOW_MINIMUM', `${field} must be at least ${constraint.minimum}`));
    }
    if (constraint.maximum !== undefined && value > constraint.maximum) {
      issues.push(issue('ABOVE_MAXIMUM', `${field} must be at most ${constraint.maximum}`));
    }
  }

  if (constraint.relative) {
    const bound = resolveRelativeBound(constraint, context);
    if (!bound) {
      // Reported rather than skipped: an unresolvable bound means the rule was NOT checked, and
      // silently treating that as a pass is how a fee cap stops being enforced without anyone noticing.
      issues.push(
        issue('UNRESOLVED_RELATIVE_BOUND', `${field} is bounded by ${constraint.relative.field}, which did not resolve`),
      );
    } else if (typeof value === 'number') {
      const fails =
        (bound.comparator === 'LTE' && value > bound.limit) ||
        (bound.comparator === 'GTE' && value < bound.limit) ||
        (bound.comparator === 'EQ' && value !== bound.limit);
      if (fails) {
        issues.push(
          issue('RELATIVE_BOUND_EXCEEDED', `${field} must be ${bound.comparator} ${bound.limit} (${constraint.relative.field})`),
        );
      }
    }
  }

  return issues;
}

/**
 * Apply defaults, then validate an organiser's choices against an effective constraint map.
 *
 * `context` supplies the values relative bounds are measured against — typically the ancestor
 * policy's own values, so `{ maximum: ⅔ × parent.sanctionFee }` can be resolved.
 *
 * `valid` reflects ENFORCE-level issues only. AUDIT and WARN issues are reported and do not block,
 * which is what lets a body record that a competition is out of policy while still counting it.
 */
export function evaluate(
  constraints: Record<string, FieldConstraint>,
  supplied: Record<string, unknown>,
  context: Record<string, unknown> = {},
): PolicyEvaluation {
  // 1. defaulting MUTATES
  const effectiveValues: Record<string, unknown> = { ...supplied };
  for (const [field, constraint] of Object.entries(constraints)) {
    if (constraint.default !== undefined && !Object.hasOwn(effectiveValues, field)) {
      effectiveValues[field] = constraint.default;
    }
  }

  // 2. validation REJECTS — run against the defaulted values, so a bad default is caught rather
  //    than exempted. `overridable: false` is checked against what the organiser actually supplied,
  //    since a default the policy itself injected is not an override.
  const issues: PolicyIssue[] = [];
  for (const [field, constraint] of Object.entries(constraints)) {
    const target = constraint.overridable === false ? supplied : effectiveValues;
    issues.push(...checkOne(field, constraint, target, context));
  }

  return { valid: !issues.some((i) => i.enforcement === 'ENFORCE'), effectiveValues, issues };
}
