# Real data import

Put real data here. It is git-ignored and mounted read-only into the backend.

```
data/import/
  cases.json        {"cases": [ ... ]}
  documents/        pdf / docx / txt files referenced by cases.json
```

Case fields: `case_number`, `case_name`, `client_name`, `case_type` (required);
`opposing_party`, `court`, `opening_date`, `next_hearing_date` (YYYY-MM-DD),
`status`, `outcome`, `case_value`, `description`, `events[]`, `tasks[]`, `documents[]`.

- `case_type`: is_hukuku | ticaret_hukuku | sozlesme | kira | icra | diger
- `status`: devam_eden | durusma_bekleyen | karar_bekleyen | kapali
- `outcome`: ongoing | won | lost | settled
- event `event_type`: filing | hearing | submission | expert_report | legal_update | note | other
- document: `{"file": "x.pdf"}` or `{"filename": "x.txt", "text": "..."}`

Run (safe to repeat):

```bash
docker compose exec backend python -m app.db.import_cases
```

Set `SEED_DEMO_DATA=false` in `.env` to remove the demo cases.
