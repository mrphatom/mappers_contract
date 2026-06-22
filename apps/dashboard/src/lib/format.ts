export function formatLamports(lamports: string | number): string {
  try {
    const bi = BigInt(typeof lamports === "number" ? Math.round(lamports) : lamports);
    const sol = Number(bi) / 1e9;
    return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } catch {
    return "0.00";
  }
}

export function truncatePubkey(pubkey: string): string {
  if (!pubkey || pubkey.length < 8) return pubkey;
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString();
}
