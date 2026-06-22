export function formatLamports(lamports: string | number): string {
  const l = typeof lamports === 'string' ? parseFloat(lamports) : lamports;
  if (isNaN(l)) return '0.00';
  return (l / 1e9).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function truncatePubkey(pubkey: string): string {
  if (!pubkey || pubkey.length < 8) return pubkey;
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString();
}
