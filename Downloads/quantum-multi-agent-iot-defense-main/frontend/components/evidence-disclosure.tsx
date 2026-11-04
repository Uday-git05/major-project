"use client";
import { useState } from "react";

export function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details className="evidence-disclosure" onToggle={e => setOpen(e.currentTarget.open)}><summary>{title}</summary>{open && children}</details>;
}
export function PagedRows<T>({ rows, render, size = 10, label }: { rows: T[]; render: (row: T, index: number) => React.ReactNode; size?: number; label: string }) {
  const [page, setPage] = useState(0); const current = Math.min(page, Math.max(0,Math.ceil(rows.length/size)-1));
  return <div aria-label={label}><p className="muted">Showing {rows.length ? current*size+1 : 0}–{Math.min((current+1)*size,rows.length)} of {rows.length} retained records</p>{rows.slice(current*size,(current+1)*size).map(render)}{rows.length > size && <div className="filter-tabs"><button disabled={!current} onClick={()=>setPage(current-1)}>Previous {label}</button><button disabled={(current+1)*size>=rows.length} onClick={()=>setPage(current+1)}>Next {label}</button></div>}</div>;
}
