let vaultToken: string | null = null;

export function getVaultToken(): string | null {
  return vaultToken;
}

export function setVaultToken(token: string | null): void {
  vaultToken = token;
}
