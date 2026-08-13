"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  buildRecordListHref,
  type RecordListQueryParams,
} from "@/lib/entity-record-list-controls";

const searchDebounceMs = 300;

export function RecordListControls({
  basePath,
  pageSize,
  query,
  searchParams,
  totalRecords,
}: {
  basePath: string;
  pageSize: number;
  query?: string;
  searchParams: RecordListQueryParams;
  totalRecords: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const latestQueryRef = useRef(query ?? "");
  const [inputValue, setInputValue] = useState(query ?? "");
  const [pending, startTransition] = useTransition();

  const replaceWith = useCallback(
    ({
      nextPageSize = String(pageSize),
      query: nextQuery,
    }: {
      nextPageSize?: string;
      query: string;
    }) => {
      const href = buildRecordListHref({
        basePath,
        pageSize: nextPageSize,
        query: nextQuery,
        searchParams,
      });

      latestQueryRef.current = nextQuery.trim();
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [basePath, pageSize, router, searchParams],
  );

  useEffect(() => {
    if (document.activeElement === inputRef.current) {
      return;
    }

    if (query !== latestQueryRef.current) {
      latestQueryRef.current = query ?? "";
      setInputValue(query ?? "");
    }
  }, [query]);

  useEffect(() => {
    if (inputValue === latestQueryRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      replaceWith({ query: inputValue });
    }, searchDebounceMs);

    return () => window.clearTimeout(timeout);
  }, [inputValue, replaceWith]);

  function clearSearch() {
    setInputValue("");
    replaceWith({ query: "" });
    inputRef.current?.focus();
  }

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_160px] md:items-center">
      <div className="relative">
        <input
          aria-label="Buscar registros"
          className="h-10 w-full rounded-md border border-input bg-background px-3 pr-10 text-sm outline-none ring-ring focus-visible:ring-2"
          name="q"
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Buscar registros..."
          ref={inputRef}
          type="search"
          value={inputValue}
        />
        {inputValue ? (
          <Button
            aria-label="Limpiar búsqueda"
            className="absolute right-1 top-1 h-8 w-8 px-0"
            onClick={clearSearch}
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <p className="whitespace-nowrap text-sm text-muted-foreground">
        {totalRecords} registro{totalRecords === 1 ? "" : "s"}
      </p>
      <select
        aria-label="Registros por página"
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        name="pageSize"
        onChange={(event) => replaceWith({
          nextPageSize: event.target.value,
          query: inputValue,
        })}
        value={String(pageSize)}
      >
        <option value="25">25 por página</option>
        <option value="50">50 por página</option>
        <option value="100">100 por página</option>
      </select>
      <span className="sr-only" role="status">
        {pending ? "Actualizando resultados" : ""}
      </span>
    </div>
  );
}
