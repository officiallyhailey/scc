// Per-table field allowlist so the records proxy fetches only the fields the
// finance pages use (smaller payloads + less data reaching the browser).
// Tables not listed fall back to fetching ALL fields, so a missing entry only
// means "slightly slower", never "missing data".
//
// Base: Reports 2026 (app5k6nhYwCIyJ4yH)
export const FIELD_PROJECTION: Record<string, string[]> = {
    // Expenses (tbllfUbqS3jlfqBsa)
    tbllfUbqS3jlfqBsa: [
        'fldnl6wlI0Fud2uYP', // Item (primary)
        'fldp0pisuhNCXGZ0w', // Order Description
        'fldndsDvc2yp4AkWj', // Category (multipleSelects)
        'fldzKrZGkIRltaOfO', // Date
        'fldfH2uojYNvLYOEu', // Unit Qty
        'fldRygxImmVarBLv5', // Unit Price
        'fldQKBAKiRWABlh58', // Tax Amount
        'fldx4bQiknh8dKSEd', // Total Amount
        'fldgFASqXCEjCoe8h', // Vendors (link)
        'fldmKLVqbCfOAajkZ', // Locations (link)
        'fldhWaafPO0SRIcwt', // Inventory (link)
        'fldsQ4CxDtGZ6AKGP', // Linked Item (singleSelect)
        'fldo51lXNC7yYztit', // Invoice
        'fld66CxY4V5JNa9Wo', // Receipt (attachments)
        'fld49KBAwQ0wuFltY', // Status
        'fldgEivaevwOaMOsr', // Bank
        'fldCt1OQun14GziUV', // Card
        'fldZ34FStyc0ykqOV', // Week Of (formula)
        'fldWPGfYZRJMR33w2', // Item (from Inventory) lookup
        'fldifE99lJOFP57LF', // Department (from Inventory) lookup
        'fldDAVM9uK5hsOgNC', // Reporting Location lookup
    ],
    // Vendors (tblAtJQ3kOjtjvzEW) — primary Name fld6DkAPxFNXgTOGT
    tblAtJQ3kOjtjvzEW: ['fld6DkAPxFNXgTOGT'],
    // Sales (tbl683TIbiGLbe0AE)
    tbl683TIbiGLbe0AE: [
        'fldZXUPAPUt07F4vP', // Item (primary)
        'fldMmVyTipRjObeXv', // Item Variation
        'fldsJDhCwC7QsVizW', // Items Sold
        'fldpQVDqtnkBqjhDf', // Net Sales
        'fldQ0LrBS7wDV6pPi', // Price
        'fldVS9TFoVyEXB87W', // Date
        'fld78xDcsP7dn2ome', // Week Start (Sunday)
        'fldqtvnReoIuNihOJ', // Locations
        'fldxFsEeyllHnnxkd', // Linked Product
        'fldgqp7uFPciWq6A6', // Department (lookup)
        'fld8zDPu8d75JW7sV', // Sales Category (lookup)
    ],
    // Products (tblaGTV9SpX0AFs7P) — primary "Sales Name" + Name
    tblaGTV9SpX0AFs7P: ['fld1Csegcy7QmeQoS', 'fldZNixKH7AdCmgo9'],
    // Time Sheets (tblDnO3dyILyYHKGH) — only what the scorecard Labor rows need
    tblDnO3dyILyYHKGH: [
        'fldBxDIGqp6FJaFLo', // Date Field
        'fldmnWNF2iHoMZP2J', // Department
        'fldD1hHapq5XMMQbl', // Locations
        'fld7I6C0eIojaTCXe', // Total Hours
        'fldqKTbI9abFbfgTw', // Holiday (hours)
        'fldtDBmxKmb9wCSOw', // Week Start (Sunday)
    ],
    // Locations (tbl3yuuDQusx3XGH8) — primary Name fld650hCbtty5mDNw
    tbl3yuuDQusx3XGH8: ['fld650hCbtty5mDNw'],
    // Inventory (tbl7TGKYDVD8b1rsV) — primary + the fields the Inventory page shows/edits
    tbl7TGKYDVD8b1rsV: [
        'fld8lyD9McgPXUkef', // Order Name (primary)
        'fldLIrkU1kwBZC6Ak', // Inventory Name
        'fldAwktEevSHIYchL', // Vendor
        'fldSBFInJcI4zYPle', // URL
        'fldC1FzYVYN9hrv9o', // Type
        'fldALe6YupfZz8uBH', // Department
        'fldfjdXPlWgWAOeDH', // #/Unit
        'fldE6sxNeqhF8RR6E', // Unit
        'fldX5r76fpI0uQYKZ', // Unit Price
        'fld232Go4XdUmYPmk', // Unit Weight
        'fldIiT3Q8yjDWeMhs', // Unit Measure
        'fldg8fe3uwkQ6CzII', // $ #/unit (formula)
        'fldQJIxMPqv0aPAm0', // Locations (tracking)
        'fld5nJzuEEwZwbBj2', // 763 Stock
        'fldFRKAhcyo6N0cbp', // 763 Base
        'fldoy3JUWjxEnZoIu', // 869 Stock
        'fldXwvZu2fsTVBzGI', // 869 Base
    ],
};
