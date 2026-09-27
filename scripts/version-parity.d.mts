// Types for scripts/version-parity.mjs (LCLI-613), so test/ can import it under strict tsc.

export interface Peer {
  repository: string;
  ref: string;
  packageName: string;
}

export type ExecFile = (
  file: string,
  args: string[],
  options?: Record<string, unknown>,
) => Promise<{ stdout: string; stderr?: string }>;

export interface PeerRead {
  version: string | null;
  source: string;
  error?: string;
}

export interface ParityVerdict {
  ok: boolean;
  problem: string | null;
  message?: string;
}

export declare const PEER: Readonly<Peer>;
export declare function peerReadArgs(peer?: Peer): string[];
export declare function readPeerVersion(options?: { peer?: Peer; execFile?: ExecFile }): Promise<PeerRead>;
export declare function checkVersionParity(args: {
  version: string | undefined;
  peerRead: PeerRead;
  versionSource?: string;
}): ParityVerdict;
export declare function requireVersionParity(args?: {
  version?: string;
  versionSource?: string;
  read?: () => Promise<PeerRead>;
}): Promise<ParityVerdict>;
