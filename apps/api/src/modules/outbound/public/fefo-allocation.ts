export interface FefoCandidate {
  balanceId: string;
  batchId: string;
  locationId: string;
  expirationDate: string;
  firstReceivedDate: string | null;
  allocatableQuantity: number;
}

export interface AllocationSelection {
  batchId: string;
  locationId: string;
  quantity: number;
}

export interface FefoAllocation extends AllocationSelection {
  balanceId: string;
  fefoRank: number;
}

function compareNullableDate(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

export function sortFefoCandidates(candidates: readonly FefoCandidate[]): FefoCandidate[] {
  return [...candidates].sort((left, right) =>
    left.expirationDate.localeCompare(right.expirationDate)
    || compareNullableDate(left.firstReceivedDate, right.firstReceivedDate)
    || left.batchId.localeCompare(right.batchId)
    || left.locationId.localeCompare(right.locationId)
  );
}

export function planFefo(candidates: readonly FefoCandidate[], requestedQuantity: number): FefoAllocation[] {
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new Error('Requested quantity must be a positive whole case quantity.');
  }

  let remaining = requestedQuantity;
  const result: FefoAllocation[] = [];
  for (const [index, candidate] of sortFefoCandidates(candidates).entries()) {
    if (!Number.isSafeInteger(candidate.allocatableQuantity) || candidate.allocatableQuantity <= 0) continue;
    const quantity = Math.min(remaining, candidate.allocatableQuantity);
    result.push({
      balanceId: candidate.balanceId,
      batchId: candidate.batchId,
      locationId: candidate.locationId,
      quantity,
      fefoRank: index + 1
    });
    remaining -= quantity;
    if (remaining === 0) return result;
  }

  throw new Error('OUTBOUND_FEFO_STOCK_INSUFFICIENT');
}

export function validateManualAllocation(
  candidates: readonly FefoCandidate[],
  requestedQuantity: number,
  selections: readonly AllocationSelection[]
): FefoAllocation[] {
  if (selections.length === 0) throw new Error('Manual allocation selections are empty.');

  const sorted = sortFefoCandidates(candidates);
  const candidateBySource = new Map(sorted.map((candidate, index) => [
    `${candidate.batchId}:${candidate.locationId}`,
    { candidate, rank: index + 1 }
  ]));
  const usedSources = new Set<string>();
  let selectedTotal = 0;
  const result: FefoAllocation[] = [];

  for (const selection of selections) {
    if (!Number.isSafeInteger(selection.quantity) || selection.quantity <= 0) {
      throw new Error('Manual allocation quantity must be a positive whole case quantity.');
    }
    const sourceKey = `${selection.batchId}:${selection.locationId}`;
    if (usedSources.has(sourceKey)) throw new Error('Manual allocation contains a duplicate source.');
    usedSources.add(sourceKey);
    const matched = candidateBySource.get(sourceKey);
    if (!matched) throw new Error('Manual allocation selected an ineligible batch or location.');
    if (selection.quantity > matched.candidate.allocatableQuantity) {
      throw new Error('Manual allocation exceeds source availability.');
    }
    selectedTotal += selection.quantity;
    result.push({
      balanceId: matched.candidate.balanceId,
      batchId: selection.batchId,
      locationId: selection.locationId,
      quantity: selection.quantity,
      fefoRank: matched.rank
    });
  }

  if (selectedTotal !== requestedQuantity) {
    throw new Error('Manual allocation must cover the full requested quantity.');
  }
  return result;
}

export function requiresFefoOverride(
  automaticPlan: readonly AllocationSelection[],
  selectedPlan: readonly AllocationSelection[]
): boolean {
  const summarize = (plan: readonly AllocationSelection[]) => new Map(
    plan.map((line) => [`${line.batchId}:${line.locationId}`, line.quantity])
  );
  const automatic = summarize(automaticPlan);
  const selected = summarize(selectedPlan);
  if (automatic.size !== selected.size) return true;
  for (const [source, quantity] of automatic) {
    if (selected.get(source) !== quantity) return true;
  }
  return false;
}
