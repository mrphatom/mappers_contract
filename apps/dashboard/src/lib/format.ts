export function formatLamports(lamports: string | number): string {
  try {
    const bi = BigInt(typeof lamports === "number" ? Math.round(lamports) : lamports);
    const LAMPORTS_PER_SOL = BigInt(1_000_000_000);
    const whole = bi / LAMPORTS_PER_SOL;
    const remainder = bi % LAMPORTS_PER_SOL;
    const fractionStr = remainder.toString().padStart(9, "0").slice(0, 4);
    const sol = parseFloat(`${whole}.${fractionStr}`);
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
