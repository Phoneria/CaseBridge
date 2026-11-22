# Data Model

## FeatureContract

Client: id String(36) PK (uuid4); law_firm_id FK law_firms.id NOT NULL, indeksli; name String(255) NOT NULL; name_key String(255) NOT NULL; client_type String(20) NOT NULL varsayılan `person`, değerler `person|company`; phone String(50) NULL; email String(255) NULL; address Text NULL; notes Text NULL; created_by FK users.id NULL; created_at/updated_at DateTime (UTC). İndeksler: ix_clients_law_firm_id, benzersiz olmayan ix_clients_law_firm_id_name_key.

CaseParty.client_id: String(36) NULL, FK clients.id (fk_case_parties_client_id_clients), ix_case_parties_client_id. Emsal olmayan davada is_client=true ⇔ client_id dolu; bağlı tarafın name değeri Client.name kopyasıdır. Emsal davada client_id her zaman boştur.

client_name_key(name) = " ".join(name.split()).replace("I","ı").replace("İ","i").lower().

ClientListItem = Client alanları + case_count (bağlı taraf üzerinden farklı, emsal olmayan dava; arşivliler dahil) + open_case_count. ClientDetailOut = Client + stats {total, open, closed, archived, won, lost, settled, total_case_value (None→0)} + cases [{id, case_number, case_name, case_type, status, outcome, assigned_lawyer_name, next_hearing_date, is_archived}].

Alembic: c8f2a4e6b0d1 (down: b9d3e7f1a520) şema+veri; eeb771ad79be boş merge (down: c8f2a4e6b0d1, d8e9f0a1b2c3). Tek head eeb771ad79be. Downgrade: client_id sütunu, sonra clients tablosu; taraf adları kalır.

Frontend PartyRow.client_id: string | null; Client, ClientListItem, ClientDetail tipleri; listClients/getClient/createClient/updateClient/deleteClient.
