import type { ReactNode } from 'react';

export function Loading() {
  return <div className="loading" role="status" aria-label="Loading"><div className="spinner" /></div>;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert err row" role="alert">
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && <button className="btn sm ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b style={{ color: 'var(--ink)' }}>{title}</b>{children}</div>;
}

export function Panel({ title, meta, children, className = '' }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || meta) && <header>{title && <h2>{title}</h2>}{meta && <span className="meta">{meta}</span>}</header>}
      {children}
    </section>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1></div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Bar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className="bar" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}><i style={{ width: `${pct}%` }} /></div>;
}

export function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 20 20"><path d="M3 17 10 3l7 14h-3.6L10 9.6 6.6 17Z" fill="#e7a23f" /></svg>
    </span>
  );
}

export function StatusPill({ completed, drill }: { completed: boolean; drill?: string | null }) {
  if (completed && drill === 'reviewed') return <span className="pill g">Done · reviewed</span>;
  if (completed) return <span className="pill g">Done</span>;
  if (drill === 'submitted') return <span className="pill a">Drill in review</span>;
  return <span className="pill">To do</span>;
}
