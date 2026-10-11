"use client";

import { useEffect, useRef, useState } from "react";

import { ModalFrame } from "@/components/ModalFrame";
import { deactivateUser, getUserWorkload } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import { userMessage } from "@/lib/userMessages";
import type { DeactivateResult, ManagedUser, UserWorkload } from "@/types";

/** Deactivation is one step with the hand-over: the work list, a required lawyer, then both happen together. */
export function DeactivateUserModal({
  user,
  candidates,
  onClose,
  onDone,
}: {
  user: ManagedUser;
  /** Active lawyers who can take the work; the modal drops the user themself. */
  candidates: ManagedUser[];
  onClose: () => void;
  onDone: (result: DeactivateResult) => void;
}) {
  const [workload, setWorkload] = useState<UserWorkload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    getUserWorkload(user.id)
      .then((result) => active && setWorkload(result))
      .catch((err) => active && setLoadError(userMessage(err, "İş yükü yüklenemedi. Lütfen tekrar deneyin.")));
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [user.id]);

  const targets = candidates.filter((item) => item.id !== user.id && item.role === "lawyer" && item.status === "active");
  const hasWork =
    workload !== null &&
    (workload.open_cases.length > 0 ||
      workload.pending_tasks.length > 0 ||
      workload.precedents_reviewing > 0 ||
      workload.upcoming_events > 0);

  async function confirm() {
    if (inFlight.current) return;
    if (hasWork && !targetId) return setError("Devredilecek avukatı seçin.");
    setError(null);
    inFlight.current = true;
    setSaving(true);
    try {
      onDone(await deactivateUser(user.id, hasWork ? targetId : undefined));
    } catch (err) {
      setError(userMessage(err, "Kullanıcı pasifleştirilemedi. Lütfen tekrar deneyin."));
      if (err instanceof ApiError && err.status === 422) {
        // Work may have appeared since the workload loaded: refresh so the hand-over select can be shown.
        try {
          const fresh = await getUserWorkload(user.id);
          if (mounted.current) setWorkload(fresh);
        } catch {
          /* keep the current view; the error above is already shown */
        }
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalFrame title={`${user.full_name} kullanıcısını pasifleştir`} onClose={onClose} busy={saving}>
      {loadError && (
        <p role="alert" className="text-sm text-red-700">
          {loadError}
        </p>
      )}
      {!loadError && !workload && <p className="text-sm text-navy-500">İş yükü yükleniyor...</p>}
      {workload && !hasWork && (
        <p className="text-sm text-navy-700">Bu kullanıcı pasifleştirilecek ve artık giriş yapamayacak.</p>
      )}
      {workload && hasWork && (
        <div className="space-y-3 text-sm text-navy-700">
          <p>Pasifleştirmeden önce aşağıdaki iş başka bir avukata devredilmeli.</p>
          {workload.open_cases.length > 0 && (
            <div>
              <p className="font-medium">Açık davalar ({workload.open_cases.length})</p>
              <ul className="list-disc pl-5">
                {workload.open_cases.map((item) => (
                  <li key={item.id}>
                    {item.case_number} — {item.case_name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {workload.pending_tasks.length > 0 && (
            <div>
              <p className="font-medium">Bekleyen görevler ({workload.pending_tasks.length})</p>
              <ul className="list-disc pl-5">
                {workload.pending_tasks.map((item) => (
                  <li key={item.id}>
                    {item.title} — {item.case_name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {workload.precedents_reviewing > 0 && <p>İncelediği emsaller: {workload.precedents_reviewing}</p>}
          {workload.upcoming_events > 0 && <p>{`${workload.upcoming_events} yaklaşan takvim etkinliği`}</p>}
          <label className="block">
            <span className="text-xs font-medium text-navy-600">Devredilecek avukat</span>
            <select
              className="mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Avukat seçin</option>
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name}
                </option>
              ))}
            </select>
          </label>
          {targets.length === 0 && <p className="text-amber-700">Devir için aktif bir avukat yok.</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => !saving && onClose()}
          aria-disabled={saving}
          className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
        >
          Vazgeç
        </button>
        {workload && (
          <button
            type="button"
            onClick={confirm}
            aria-disabled={saving}
            className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white aria-disabled:opacity-60"
          >
            {saving ? "Pasifleştiriliyor..." : hasWork ? "Devret ve pasifleştir" : "Pasifleştir"}
          </button>
        )}
      </div>
    </ModalFrame>
  );
}
