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
    // Time Sheets (tblDnO3dyILyYHKGH) — the scorecard's Labor-row fields PLUS the writable
    // fields the Payroll Upload wizard reads/writes (roster link, pay period, per-shift hours,
    // duplicate-shift detection needs staffPayrollLink+dateField+assignedRole+locations).
    tblDnO3dyILyYHKGH: [
        'fldBxDIGqp6FJaFLo', // Date Field
        'fldmnWNF2iHoMZP2J', // Department
        'fldD1hHapq5XMMQbl', // Locations
        'fld7I6C0eIojaTCXe', // Total Hours
        'fldqKTbI9abFbfgTw', // Holiday (hours, formula)
        'fldtDBmxKmb9wCSOw', // Week Start (Sunday)
        'fldQMbumB0qnu2Qsa', // Staff Payroll (link)
        'fldr9mRGeY95YBvJ4', // Pay Period
        'fldhOru1LY47wegMc', // Break
        'fldVVjQDGO7CfFfMi', // Assigned Role
        'fldg7DPXmWGcEHFIc', // Actual Hours
        'fldcXOGycLK6FAVDk', // PTO
        'fldyyNJa9iean99lx', // Holiday Pay (raw input, distinct from the Holiday formula above)
        'fldsSYj3P4Kn6hfee', // OT
        'fldHkD2vVF00RbD0E', // Tips (link)
    ],
    // Locations (tbl3yuuDQusx3XGH8) — primary Name fld650hCbtty5mDNw
    tbl3yuuDQusx3XGH8: ['fld650hCbtty5mDNw'],
    // Staff Payroll (tbl1Mkzsyfon5DUQJ) — the roster, as read by the Payroll Upload wizard
    tbl1Mkzsyfon5DUQJ: [
        'fldU5Hco0Blunv1Ls', // Homebase Name (primary)
        'fldd4rlkHHZDPJe4w', // Payroll Name
        'fldbt9xUyBFGJO5UD', // Locations
    ],
    // Tips (tblopighicISZpKhC) — one row per day, both locations as sibling fields
    tblopighicISZpKhC: [
        'fldm1TE2T7NY0PHRu', // Date
        'fldrG8ZTZUgziZJ8O', // 763 Credit Tips
        'fldAQNIA1v62tBlzY', // 763 Cash Tips
        'fldxeJMFyDzSeaDgP', // 869 Credit Tips
        'fldxxcwR4l2wYqg0m', // 869 Cash Tips
        'fldOLR0WqcPDsWvWy', // Time Sheets (link)
        'fldvyBbDf8kKhkPyV', // 763 Total Tips (formula, reconciliation display only)
        'fld1er0afkc117sp1', // 869 Total Tips (formula, reconciliation display only)
    ],
    // Payroll (tbl5j68UCyfN5t1pP) — the final table, written after the Pivot approval gate
    tbl5j68UCyfN5t1pP: [
        'fldmqf1QdvAzyRTOL', // Pay-Period
        'fld7CrWlUumzPpnN8', // Department
        'fldB7fmmlAjMkoTDR', // Date
        'fldnnVEiYCMfSWFcV', // Staff Profiles (link)
        'fldnsaK1m3K5U47Km', // Role
        'fldGrtY7cbJuTj72j', // Hours
        'fldqgjiHxsTCappPd', // OT
        'fldgUB8oAakV5rRwt', // PTO
        'fldbrcvpqtX4Gh6HS', // Holiday
        'fldtFGu2n4HHgIAKZ', // Tips
        'fldPvBtY6sjsPMEQF', // Locations (link)
    ],
    // Roles (tbllR2IqmcfEcjgI5) — role name → department lookup, used to resolve Payroll.Department
    tbllR2IqmcfEcjgI5: [
        'fldrGaKTi4YBXSwQ8', // Name (primary)
        'fldyhae5NN6Y0gZmg', // Departement
    ],
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
