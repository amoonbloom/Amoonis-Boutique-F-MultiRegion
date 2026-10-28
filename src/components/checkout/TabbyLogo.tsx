/**
 * Current Tabby badge (black wordmark on Tabby green) — primary colourway from
 * Tabby merchant / brand guidelines. Do not recolour or stretch.
 * (The older dark pill with mint letters is outdated — do not use it.)
 */
export function TabbyLogo({ className = "h-5 w-auto" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand asset in /public
    <img
      src="/brand/tabby-logo-green.png"
      alt="Tabby"
      className={`inline-block object-contain ${className}`}
      width={72}
      height={28}
      decoding="async"
    />
  );
}
