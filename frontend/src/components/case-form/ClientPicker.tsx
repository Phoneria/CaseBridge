"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { INPUT_CLASS } from "@/components/case-form/Field";
import { createClient, listClients } from "@/lib/api";
import { CLIENT_TYPE_LABELS } from "@/lib/clients";
import { userMessage } from "@/lib/userMessages";
import type { ClientListItem } from "@/types";

export const SEARCH_DELAY_MS = 250;

interface Props {
  inputId: string;
  /** The typed text, or the chosen client's name. */
  query: string;
  clientId: string | null;
  maxLength: number;
  invalid?: boolean;
  describedBy?: string;
  onQueryChange: (text: string) => void;
  onSelect: (client: { id: string; name: string }) => void;
  onClear: () => void;
}

type Option = { kind: "client"; client: ClientListItem } | { kind: "new" };

/** Name field of a client party: search the firm's clients, or add the typed name as a new client. */
export function ClientPicker({ inputId, query, clientId, maxLength, invalid, describedBy, onQueryChange, onSelect, onClear }: Props) {
  const listId = useId();
  const [results, setResults] = useState<ClientListItem[]>([]);
  // Open from the start: a name the AI filled in shows its suggestions right away.
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(-1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const trimmed = query.trim();

  useEffect(() => {
    const id = ++requestId.current;
    if (clientId || !trimmed) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      listClients({ q: trimmed, limit: 10 })
        .then((items) => requestId.current === id && setResults(items))
        .catch(() => requestId.current === id && setResults([]));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [trimmed, clientId]);

  if (clientId) {
    return (
      <div className="flex min-h-[38px] items-center justify-between gap-2 rounded-lg border border-accent-200 bg-accent-50 px-3 py-1.5">
        <Link href={`/muvekkiller/${clientId}`} className="truncate text-sm font-medium text-accent-700 hover:underline">
          {query}
        </Link>
        <button
          type="button"
          aria-label="Müvekkili değiştir"
          onClick={() => {
            setOpen(true);
            onClear();
          }}
          className="shrink-0 text-xs font-semibold text-navy-600 hover:text-accent-700"
        >
          Değiştir
        </button>
      </div>
    );
  }

  const options: Option[] = [
    ...results.map((client) => ({ kind: "client" as const, client })),
    ...(trimmed ? [{ kind: "new" as const }] : []),
  ];
  const expanded = open && options.length > 0;

  async function addNew() {
    if (inFlight.current || !trimmed) return;
    inFlight.current = true;
    setCreating(true);
    setError(null);
    try {
      const client = await createClient({ name: trimmed, client_type: "person", phone: null, email: null, address: null, notes: null });
      onSelect({ id: client.id, name: client.name });
    } catch (err) {
      setError(userMessage(err, "Müvekkil eklenemedi."));
    } finally {
      inFlight.current = false;
      setCreating(false);
    }
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    if (option.kind === "new") void addNew();
    else onSelect({ id: option.client.id, name: option.client.name });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && expanded) {
      // Never submit the case form from the suggestion list.
      event.preventDefault();
      if (active >= 0) choose(active);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="relative">
      <input
        id={inputId}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={Boolean(invalid)}
        aria-required="true"
        aria-describedby={describedBy}
        autoComplete="off"
        maxLength={maxLength}
        className={INPUT_CLASS}
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {expanded && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Müvekkil önerileri"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-surface-border bg-white py-1 shadow-card"
        >
          {options.map((option, index) => (
            <li
              key={option.kind === "client" ? option.client.id : "new"}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Keep the input focused so the click lands before the list closes on blur.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              className={`cursor-pointer px-3 py-2 text-sm ${index === active ? "bg-accent-50" : "hover:bg-surface-muted"}`}
            >
              {option.kind === "client" ? (
                <>
                  <span className="font-medium text-navy-800">{option.client.name}</span>{" "}
                  <span className="text-xs text-navy-500">
                    {CLIENT_TYPE_LABELS[option.client.client_type]}
                    {option.client.phone ? ` · ${option.client.phone}` : ""}
                  </span>
                </>
              ) : (
                <span className="font-medium text-accent-700">{`+ '${trimmed}' adıyla yeni müvekkil ekle`}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <p role="status" className="mt-1 text-xs text-navy-500">
          Müvekkil ekleniyor...
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
