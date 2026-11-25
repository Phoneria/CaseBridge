# Design decisions

The legacy precedent archive had categories but no explicit case association. Same-category suggestions serve as a starting point. A unique case-to-precedent link keeps a manager's selection even when it comes from another category. The existing tenant boundary protects both IDs.

Calendar, reminders, handovers and reports already consume pending/completed. An open-stage column stores the planning stage, and the existing completion flag determines the displayed Done column. This also covers old clients and restricted-workspace completion actions.

Ten supplemental fictional matters complement the existing twenty. Each original category gets one decision opposite a known sample outcome and one pseudo-random result seeded by bureau ID. The import preserves existing decisions. The analytics code continues to calculate won / (won + lost).

CSV generation already handles quoting and spreadsheet formula safety. The preview reads those serialized cells on the server, using the standard CSV reader and returning plain strings to a React table.
