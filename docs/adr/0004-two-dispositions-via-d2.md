# Two-disposition detachments via an optional `d2`

Many 3DP (generic) detachments can be fielded as *either* of two Force
Dispositions (e.g. T'au Retaliation Cadre = Purge the Foe **or** Reconnaissance).
We model the alternative as an optional `d2` on `Detachment` + a
`detachmentDispositions()` helper, rather than duplicating the detachment as two
rows. Duplicate rows were rejected because selection is keyed by detachment name,
so a duplicate would toggle both and couldn't be told apart. Don't "simplify" this
back into two entries.
