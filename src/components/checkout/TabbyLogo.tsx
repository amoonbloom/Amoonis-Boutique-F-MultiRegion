/** Tabby wordmark used next to the approved checkout payment method name. */
export function TabbyLogo({ className = "h-5 w-auto" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded px-1.5 ${className}`}
      style={{ backgroundColor: "#3EEDBF", height: "1.25rem", minWidth: "3.25rem" }}
      role="img"
      aria-label="Tabby"
    >
      <span
        className="leading-none"
        style={{
          color: "#0B0B0B",
          fontSize: "0.6875rem",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        tabby
      </span>
    </span>
  );
}
