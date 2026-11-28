# Research
- `Case.next_hearing_date` is nullable; `opening_date` is not (model default, required on update), so only the next hearing needed a guard. The fact note in the same function already guarded it ("Sonraki duruşma: Kayıt yok"); the task text did not.
- The seed runs on every container start and reuses existing demo rows, so the dates in an older database drift away from the seed's own values.
