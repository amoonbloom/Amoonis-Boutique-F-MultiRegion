/** Official Tabby wordmark (from Tabby brand / Magento SDK assets). Do not recolour. */
export function TabbyLogo({ className = "h-5 w-auto" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand asset in /public
    <img
      src="/brand/tabby-logo.png"
      alt="Tabby"
      className={`inline-block object-contain ${className}`}
      width={72}
      height={20}
      decoding="async"
    />
  );
}
