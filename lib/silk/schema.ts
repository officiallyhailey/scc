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
} as const;

// Time Sheets field IDs (tblDnO3dyILyYHKGH) — for the scorecard Labor rows.
export const TS = {
    dateField: 'fldBxDIGqp6FJaFLo',   // date
    department: 'fldmnWNF2iHoMZP2J',  // formula → Bar/Kitchen/…
    locations: 'fldD1hHapq5XMMQbl',   // link → Locations
    totalHours: 'fld7I6C0eIojaTCXe',  // formula (Total Hours — EXCLUDES holiday + OT)
    holiday: 'fldqKTbI9abFbfgTw',     // formula (Holiday hours, break-adjusted)
    weekStart: 'fldtDBmxKmb9wCSOw',   // formula MM/DD/YYYY (Sunday) — aligns with scorecard weeks
} as const;

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
