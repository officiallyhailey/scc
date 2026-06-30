// Purchase-history analysis for inventory items. Each inventory item is linked to the
// Expenses that purchased it (EX.inventory). We compute the unit-price history per item
// and flag purchases whose unit price came in meaningfully above the item's *listed*
// Unit Price (INV.unitPrice) — the signal that prices are creeping up / a vendor change
// may be due. Pure data helpers (no React) so both the list page and the report reuse them.

import type { RecordModel } from '@/lib/airtable/models';
import { EX, INV } from '@/lib/silk/schema';
import { num, str, linkIds } from '@/lib/silk/cells';

// A purchase is flagged when its unit price is at least this far above the listed price.
export const PRICE_FLAG_PCT = 0.10;

/**
 * % difference of one purchase's unit price vs an inventory item's listed price, normalized
 * so pack-size / unit-of-measure mismatches don't produce bogus deltas.
 *
 * An item gives us two reliable reference prices: its listed Unit Price (per pack/case/lb) and
 * that ÷ #/Unit (per individual item — the "$ #/unit" formula). An invoice line's unit price may
 * be written on EITHER basis (a case price vs an each price), and the expense's own pack-size
 * field is frequently missing or wrong — so rather than trust it, we snap the purchase price to
 * whichever of the item's two reference prices it sits closest to (on a ratio/log scale) and take
 * the % difference from that. This keeps like-for-like comparisons (e.g. $14.50/lb vs $10/lb =
 * +45%) while preventing a per-case price from being compared against a per-each listing.
 * Returns null when either side is missing or non-positive.
 */
export function listedPriceDelta(purchaseUnit: number, listed: number, perUnit: number): number | null {
    if (purchaseUnit <= 0 || listed <= 0) return null;
    const perItem = perUnit > 1 ? listed / perUnit : listed;
    // Unpacked item (or no #/Unit): the two references coincide — straight comparison.
    if (perItem >= listed) return (purchaseUnit - listed) / listed;
    const ref = Math.abs(Math.log(purchaseUnit / perItem)) < Math.abs(Math.log(purchaseUnit / listed)) ? perItem : listed;
    return (purchaseUnit - ref) / ref;
}

export type Purchase = {
    id: string;
    date: string;          // ISO YYYY-MM-DD (sorts lexically = chronologically)
    vendorName: string;
    qty: number;
    unitPrice: number;     // EX.unitPrice, or total/qty when the unit price is blank
    total: number;
    deltaVsBase: number | null; // (unitPrice − baseline) / baseline; null if either is 0
    flagged: boolean;      // deltaVsBase ≥ PRICE_FLAG_PCT
};

export type PriceHistory = {
    purchases: Purchase[];     // oldest → newest
    count: number;
    baseline: number;          // the item's listed Unit Price
    latest: Purchase | null;   // most recent *priced* purchase
    latestDelta: number | null;
    latestFlagged: boolean;
    min: number | null;
    max: number | null;
    avg: number | null;
};

function resolveUnitPrice(e: RecordModel): number {
    const up = num(e, EX.unitPrice);
    if (up > 0) return up;
    const qty = num(e, EX.unitQty);
    const total = num(e, EX.total);
    return qty > 0 ? total / qty : 0;
}

/** Full price history for one inventory item, built from its linked Expenses. */
export function buildPriceHistory(
    expenses: RecordModel[], invId: string, baseline: number, basePerUnit: number, vendorNames: Map<string, string>,
): PriceHistory {
    const linked = expenses
        .filter(e => linkIds(e, EX.inventory).includes(invId))
        .sort((a, b) => str(a, EX.date).localeCompare(str(b, EX.date)) || a.createdTime.localeCompare(b.createdTime));
    const purchases: Purchase[] = linked.map(e => {
        const unitPrice = resolveUnitPrice(e);
        const vId = linkIds(e, EX.vendors)[0];
        const deltaVsBase = listedPriceDelta(unitPrice, baseline, basePerUnit);
        return {
            id: e.id,
            date: str(e, EX.date),
            vendorName: vId ? (vendorNames.get(vId) ?? '') : '',
            qty: num(e, EX.unitQty),
            unitPrice,
            total: num(e, EX.total),
            deltaVsBase,
            flagged: deltaVsBase != null && deltaVsBase >= PRICE_FLAG_PCT,
        };
    });

    const priced = purchases.filter(p => p.unitPrice > 0);
    const prices = priced.map(p => p.unitPrice);
    const latest = priced.length ? priced[priced.length - 1] : null;
    return {
        purchases,
        count: purchases.length,
        baseline,
        latest,
        latestDelta: latest ? latest.deltaVsBase : null,
        latestFlagged: latest ? latest.flagged : false,
        min: prices.length ? Math.min(...prices) : null,
        max: prices.length ? Math.max(...prices) : null,
        avg: prices.length ? prices.reduce((s, n) => s + n, 0) / prices.length : null,
    };
}

/**
 * One-pass map of inventory id → latest-purchase flag, for the list badge/filter/sort.
 * Compares each item's most recent *priced* purchase to that item's listed Unit Price.
 * Items with no priced purchase or no listed price are omitted (treated as unflagged).
 */
export function buildFlagMap(
    expenses: RecordModel[], invRecords: RecordModel[],
): Map<string, { flagged: boolean; latestDelta: number }> {
    // latest priced purchase per inventory id
    const latest = new Map<string, { date: string; created: string; unitPrice: number }>();
    for (const e of expenses) {
        const ids = linkIds(e, EX.inventory);
        if (!ids.length) continue;
        const unitPrice = resolveUnitPrice(e);
        if (unitPrice <= 0) continue;
        const date = str(e, EX.date);
        const created = e.createdTime;
        for (const id of ids) {
            const cur = latest.get(id);
            if (!cur || date > cur.date || (date === cur.date && created > cur.created)) {
                latest.set(id, { date, created, unitPrice });
            }
        }
    }
    const out = new Map<string, { flagged: boolean; latestDelta: number }>();
    for (const inv of invRecords) {
        const l = latest.get(inv.id);
        const baseline = num(inv, INV.unitPrice);
        if (!l || baseline <= 0) continue;
        const delta = listedPriceDelta(l.unitPrice, baseline, num(inv, INV.perUnit));
        if (delta == null) continue;
        out.set(inv.id, { flagged: delta >= PRICE_FLAG_PCT, latestDelta: delta });
    }
    return out;
}
