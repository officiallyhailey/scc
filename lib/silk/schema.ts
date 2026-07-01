// Silk City Coffee — Reports 2026 base (app5k6nhYwCIyJ4yH) schema constants.
// Shared by the Expenses page, Upload page and the /api/parse route.

export const TABLES = {
    expenses: 'tbllfUbqS3jlfqBsa',
    vendors: 'tblAtJQ3kOjtjvzEW',
    locations: 'tbl3yuuDQusx3XGH8',
    inventory: 'tbl7TGKYDVD8b1rsV',
    documents: 'tblgqoClFQQ5OQQpY',
    report: 'tblc9ob9qJpkcgH3t',
    sales: 'tbl683TIbiGLbe0AE',
    products: 'tblaGTV9SpX0AFs7P',
    salesCategories: 'tbl9ILdL3paGQrJUC', // link target of PRODUCT.salesCategory
    timeSheets: 'tblDnO3dyILyYHKGH',
    staffPayroll: 'tbl1Mkzsyfon5DUQJ',
    tips: 'tblopighicISZpKhC',
    payroll: 'tbl5j68UCyfN5t1pP',
    roles: 'tbllR2IqmcfEcjgI5',
} as const;

// Time Sheets field IDs (tblDnO3dyILyYHKGH). The read-only formula fields below (dateField,
// department, locations, totalHours, holiday, weekStart) are shared with the scorecard's Labor
// rows. The Payroll Upload wizard also WRITES this table — its writable fields are listed
// separately so a scorecard-only field (e.g. `holiday`, a break-adjusted formula) is never
// confused with the writable `holidayPay` raw input the wizard sets per shift.
export const TS = {
    dateField: 'fldBxDIGqp6FJaFLo',   // date — also the shift's clock-in date (writable)
    department: 'fldmnWNF2iHoMZP2J',  // formula → Bar/Kitchen/… (read-only)
    locations: 'fldD1hHapq5XMMQbl',   // link → Locations (writable: one location per shift)
    totalHours: 'fld7I6C0eIojaTCXe',  // formula (Total Hours — EXCLUDES holiday + OT) (read-only)
    holiday: 'fldqKTbI9abFbfgTw',     // formula (Holiday hours, break-adjusted) (read-only)
    weekStart: 'fldtDBmxKmb9wCSOw',   // formula MM/DD/YYYY (Sunday) — aligns with scorecard weeks (read-only)
    // Writable fields used by the Payroll Upload wizard (app/upload/PayrollWizard.tsx):
    staffPayrollLink: 'fldQMbumB0qnu2Qsa', // link → Staff Payroll (the roster-match result)
    payPeriod: 'fldr9mRGeY95YBvJ4',        // singleSelect, format "M.D-M.D.YY" (day zero-padded, month not)
    breakMin: 'fldhOru1LY47wegMc',         // number — minutes, parsed from Homebase's "28 min"
    assignedRole: 'fldVVjQDGO7CfFfMi',     // singleLineText — raw Role column, free text
    actualHours: 'fldg7DPXmWGcEHFIc',      // number
    pto: 'fldcXOGycLK6FAVDk',              // number
    holidayPay: 'fldyyNJa9iean99lx',       // number — Homebase's raw "Holiday pay" hours (distinct from the `holiday` formula above)
    ot: 'fldsSYj3P4Kn6hfee',               // number — passed through from Homebase's own "OT hours" column, never derived
    tipsLink: 'fldHkD2vVF00RbD0E',         // link → Tips, set at Time Sheets creation time
} as const;

// Staff Payroll field IDs (tbl1Mkzsyfon5DUQJ) — the roster. The wizard reads Homebase Name to
// match incoming shift names, and writes Homebase Name/Payroll Name/Locations when creating a
// new-hire record inline. Rate 1-4 / Rate-N Roles exist but are intentionally NOT read or
// written by the wizard — wage resolution is handled entirely elsewhere (see PayrollWizard.tsx).
export const STAFF = {
    homebaseName: 'fldU5Hco0Blunv1Ls',  // singleLineText — match incoming CSV names against THIS field
    payrollName: 'fldd4rlkHHZDPJe4w',   // singleLineText, "Last, First" display format
    locations: 'fldbt9xUyBFGJO5UD',     // link → Locations
} as const;

// Tips field IDs (tblopighicISZpKhC) — one row per DAY (both locations share a row; see
// PayrollWizard.tsx for the read-then-merge write pattern this requires).
export const TIPS = {
    date: 'fldm1TE2T7NY0PHRu',            // date
    credit763: 'fldrG8ZTZUgziZJ8O',        // currency
    cash763: 'fldAQNIA1v62tBlzY',          // currency
    credit869: 'fldxeJMFyDzSeaDgP',        // currency
    cash869: 'fldxxcwR4l2wYqg0m',          // currency
    timeSheetsLink: 'fldOLR0WqcPDsWvWy',   // link → Time Sheets — set from the Time Sheets side; never write this directly
    // Read-only formulas — used ONLY by the Pivot review's reconciliation panel to show what
    // Airtable itself computed from the fresh writes (never written by the wizard).
    totalTips763: 'fldvyBbDf8kKhkPyV',    // formula
    totalTips869: 'fld1er0afkc117sp1',    // formula
} as const;

// Payroll field IDs (tbl5j68UCyfN5t1pP) — the final table, one row per (employee × role ×
// pay period), written only after the Pivot review's approval gate. `Wage` is intentionally
// excluded — the wizard never resolves or writes a wage value.
export const PAYROLL = {
    payPeriod: 'fldmqf1QdvAzyRTOL',     // singleSelect, same "M.D-M.D.YY" format as Time Sheets
    department: 'fld7CrWlUumzPpnN8',    // singleSelect
    date: 'fldB7fmmlAjMkoTDR',          // date — the pay period's START date, not a shift date
    staffProfiles: 'fldnnVEiYCMfSWFcV', // link → Staff Payroll
    role: 'fldnsaK1m3K5U47Km',          // singleLineText, free text
    hours: 'fldGrtY7cbJuTj72j',         // number — SUM of Actual Hours for this employee+role this period
    ot: 'fldqgjiHxsTCappPd',            // number — SUM
    pto: 'fldgUB8oAakV5rRwt',           // number — SUM
    holiday: 'fldbrcvpqtX4Gh6HS',       // number — SUM
    tips: 'fldtFGu2n4HHgIAKZ',          // currency — allocated total (see allocateTipsForDay in lib/silk/payroll.ts)
    locations: 'fldPvBtY6sjsPMEQF',     // link → Locations
} as const;

// Roles field IDs (tbllR2IqmcfEcjgI5) — a lookup table mapping a role NAME to a department,
// used to resolve PAYROLL.department from a shift's free-text Assigned Role.
export const ROLES = {
    name: 'fldrGaKTi4YBXSwQ8',        // singleLineText, e.g. "Barista", "dish shift", "Roastery"
    department: 'fldyhae5NN6Y0gZmg',  // singleSelect, e.g. "Bar", "Kitchen", "Shop"
} as const;

/** "M.D-M.D.YY" (day zero-padded, month not) — matches the real Pay Period/Pay-Period
 *  singleSelect choices already in Airtable (e.g. "6.08-6.21.26"). */
export function formatPayPeriod(startISO: string, endISO: string): string {
    const fmt = (iso: string) => {
        const [, m, d] = iso.split('-');
        return `${Number(m)}.${d}`;
    };
    const yy = startISO.slice(2, 4);
    return `${fmt(startISO)}-${fmt(endISO)}.${yy}`;
}

// Labor cost per hour (flat rate). Make configurable later if it varies by role/location.
export const LABOR_RATE = 22;

// Sales field IDs (tbl683TIbiGLbe0AE).
export const SALE = {
    item: 'fldZXUPAPUt07F4vP',          // singleLineText (primary)
    itemVariation: 'fldMmVyTipRjObeXv', // singleLineText
    itemsSold: 'fldsJDhCwC7QsVizW',     // number
    netSales: 'fldpQVDqtnkBqjhDf',      // currency
    price: 'fldQ0LrBS7wDV6pPi',         // currency
    date: 'fldVS9TFoVyEXB87W',          // date
    weekStart: 'fld78xDcsP7dn2ome',     // formula MM/DD/YYYY (Sunday) — read-only
    locations: 'fldqtvnReoIuNihOJ',     // link → Locations
    linkedProduct: 'fldxFsEeyllHnnxkd', // link → Products (drives Department/Category)
    department: 'fldgqp7uFPciWq6A6',    // lookup → Bar/Kitchen/Retail Coffee/… (read-only)
    salesCategory: 'fld8zDPu8d75JW7sV', // lookup (read-only)
} as const;

// Products (tblaGTV9SpX0AFs7P). Primary "Sales Name" (formula) is the link display.
export const PRODUCT = {
    salesName: 'fld1Csegcy7QmeQoS',     // formula: Name + " " + Variation (read-only, link display)
    name: 'fldZNixKH7AdCmgo9',          // singleLineText
    variation: 'fldZ9hLJopE2JeBl5',     // singleLineText
    price: 'fldebm5Db3mKKUKOj',         // currency
    salesCategory: 'fldgl4Vgd9rkHC9QB', // link → Sales Categories (drives Department/Category lookups)
    locations: 'fldn4GjAykATJ5OMW',     // link → Locations
} as const;

// Sales Categories table (tbl9ILdL3paGQrJUC). Each record has a Type single-select
// (Bar/Kitchen/Retail Coffee/…); many records share a Type, so the product picker maps
// each distinct Type to one representative record (the Department lookup only reads Type).
export const SALES_CATEGORY = { type: 'fld5fGNjSHriHiOJV' } as const;

// Sales "Department" lookup → tracked scorecard department (Bar folds in Retail Coffee).
export function salesTrackedDept(dept: string): 'Bar' | 'Kitchen' | null {
    if (dept === 'Bar' || dept === 'Retail Coffee') return 'Bar';
    if (dept === 'Kitchen') return 'Kitchen';
    return null;
}
// Expense "Category" → tracked scorecard department.
export function expenseTrackedDept(cat: string): 'Bar' | 'Kitchen' | null {
    if (cat === 'Bar') return 'Bar';
    if (cat === 'Kitchen') return 'Kitchen';
    return null;
}
export const TRACKED_DEPTS = ['Bar', 'Kitchen'] as const;

// Expenses field IDs.
export const EX = {
    item: 'fldnl6wlI0Fud2uYP',          // singleLineText (primary)
    orderDesc: 'fldp0pisuhNCXGZ0w',     // singleLineText
    category: 'fldndsDvc2yp4AkWj',      // multipleSelects
    date: 'fldzKrZGkIRltaOfO',          // date
    unitQty: 'fldfH2uojYNvLYOEu',       // number
    unitPrice: 'fldRygxImmVarBLv5',     // currency
    tax: 'fldQKBAKiRWABlh58',           // currency
    total: 'fldx4bQiknh8dKSEd',         // currency
    vendors: 'fldgFASqXCEjCoe8h',       // link → Vendors
    locations: 'fldmKLVqbCfOAajkZ',     // link → Locations
    inventory: 'fldhWaafPO0SRIcwt',     // link → Inventory
    linkedItem: 'fldsQ4CxDtGZ6AKGP',    // singleSelect
    invoice: 'fldo51lXNC7yYztit',       // singleLineText
    lineItem: 'fldlYhwebXz5OEK8l',      // singleLineText (SKU / item number)
    unitOfMeasure: 'fldy5FRvBYQHttL4y', // singleSelect (LB/ea/oz/gal/dozen/in)
    perUnit: 'flde28h7aal76kZYf',       // number (#/Unit pack size)
    receipt: 'fld66CxY4V5JNa9Wo',       // multipleAttachments
    status: 'fld49KBAwQ0wuFltY',        // singleSelect
    bank: 'fldgEivaevwOaMOsr',          // singleSelect
    card: 'fldCt1OQun14GziUV',          // singleSelect
    weekOf: 'fldZ34FStyc0ykqOV',        // formula (read-only)
    itemFromInv: 'fldWPGfYZRJMR33w2',   // lookup (read-only)
    deptFromInv: 'fldifE99lJOFP57LF',   // lookup (read-only)
    reportingLoc: 'fldDAVM9uK5hsOgNC',  // lookup (read-only)
} as const;

// Select choices (names exactly as in Airtable).
export const CATEGORY_CHOICES = [
    'Bar', 'Kitchen', 'Coffee Beans', 'Supplies', 'Shipping', 'Fees', 'Utilities',
    'Marketing', 'Retail', 'Reimbursement', 'Refund', 'Moral', 'Give Back',
    'Credit Adjustment', 'Payment Deposit', 'Points', 'Protection Plan',
] as const;

// Inventory field IDs (tbl7TGKYDVD8b1rsV).
export const INV = {
    orderName: 'fld8lyD9McgPXUkef',        // singleLineText (primary, "Order Name")
    name: 'fldLIrkU1kwBZC6Ak',             // singleLineText ("Inventory Name")
    vendor: 'fldAwktEevSHIYchL',           // link → Vendors
    url: 'fldSBFInJcI4zYPle',              // url ("Link")
    type: 'fldC1FzYVYN9hrv9o',             // singleSelect
    department: 'fldALe6YupfZz8uBH',       // singleSelect
    perUnit: 'fldfjdXPlWgWAOeDH',          // number (#/Unit)
    unit: 'fldE6sxNeqhF8RR6E',             // singleSelect (Unit)
    unitPrice: 'fldX5r76fpI0uQYKZ',        // currency
    unitWeight: 'fld232Go4XdUmYPmk',       // number
    unitMeasure: 'fldIiT3Q8yjDWeMhs',      // singleSelect
    dollarPerUnit: 'fldg8fe3uwkQ6CzII',    // formula ($ #/unit) — read-only
    trackingLocations: 'fldQJIxMPqv0aPAm0',// link → Locations
    stock763: 'fld5nJzuEEwZwbBj2',         // number (763 Stock)
    base763: 'fldFRKAhcyo6N0cbp',          // number (763 Base)
    stock869: 'fldoy3JUWjxEnZoIu',         // number (869 Stock)
    base869: 'fldXwvZu2fsTVBzGI',          // number (869 Base)
} as const;

export const STATUS_CHOICES = ['Submitted', 'Approved', 'Processed'] as const;
export const BANK_CHOICES = ['Chase', 'Amex', 'Webster', 'Capital'] as const;
export const CARD_CHOICES = ['1001', '2421', '1004', '7568', '7913', '5462', '7947', '7954', '7939', 'N/A'] as const;
