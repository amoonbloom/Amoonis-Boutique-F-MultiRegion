/**
 * Public Tabby snippet credentials (safe for the browser).
 * Secret key must never appear here — only pk_ + merchant code.
 */
export function getTabbySnippetConfig(): {
  publicKey: string;
  merchantCode: string;
  configured: boolean;
} {
  const publicKey = (process.env.NEXT_PUBLIC_TABBY_PUBLIC_KEY || "").trim();
  const merchantCode = (process.env.NEXT_PUBLIC_TABBY_MERCHANT_CODE || "AmoonBloom").trim();
  return {
    publicKey,
    merchantCode,
    configured: Boolean(publicKey && merchantCode),
  };
}
