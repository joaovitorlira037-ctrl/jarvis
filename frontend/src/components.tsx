import { useEffect, useRef, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

export function Panel({
  title,
  icon: Icon,
  tag,
  children,
  className = "",
  action,
}: {
  title: string;
  icon: LucideIcon;
  tag?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <Icon size={14} />
          <h2>{title}</h2>
        </div>
        {action || (tag && <span className="panel-tag">{tag}</span>)}
      </div>
      {children}
    </section>
  );
}

export function Sparkline({
  values,
  className = "",
}: {
  values: number[];
  className?: string;
}) {
  const coords = values.length
    ? values
        .map(
          (value, i) =>
            `${values.length === 1 ? 100 : (i / (values.length - 1)) * 200},${60 - (value / 100) * 54}`,
        )
        .join(" ")
    : "";
  return (
    <svg
      viewBox="0 0 200 64"
      className={`sparkline ${className}`}
      role="img"
      aria-label="Histórico de utilização real"
    >
      <defs>
        <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="currentColor" stopOpacity=".18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[12, 28, 44, 60].map((y) => (
        <line
          key={y}
          x1="0"
          y1={y}
          x2="200"
          y2={y}
          stroke="currentColor"
          opacity=".08"
        />
      ))}
      {coords && (
        <>
          <polygon points={`0,64 ${coords} 200,64`} fill="url(#chart-fill)" />
          <polyline
            points={coords}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const element = useRef<HTMLElement>(null);
  const previous = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
      previous.current?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={element}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Tab") {
            const focusable = Array.from(
              element.current!.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input:not(:disabled), textarea, select, a[href]",
              ),
            ).filter((el) => el.offsetParent !== null);
            const first = focusable[0],
              last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="modal-heading">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            aria-label="Fechar janela"
            onClick={onClose}
            autoFocus
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export const bytes = (value: number) =>
  value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(1)} GB`
    : value >= 1024 ** 2
      ? `${(value / 1024 ** 2).toFixed(1)} MB`
      : `${(value / 1024).toFixed(1)} KB`;
export const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
