export const OBSCRA_RPC_ENDPOINT = "https://staging.oobeprotocol.ai:8080/rpc";
export const OBSCRA_RPC_LABEL = "OOBE Staging RPC";

export function resolveObscraRpcEndpoint(explicit?: string): string {
  return explicit || process.env.ANCHOR_PROVIDER_URL || OBSCRA_RPC_ENDPOINT;
}
