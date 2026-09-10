/**
 * GHOSTSIG for Blux.
 *
 * GHOSTSIG (https://ghostsig.dev) is a hosted wallet with no extension and no
 * stored private key: a passkey's PRF output is expanded into an ed25519 key
 * for one signature and zeroed. This file opens ghostsig.dev as a popup and
 * sends one request per signature over postMessage, to that origin only. One
 * passkey prompt approves one signature, and login proves ownership with a
 * SEP-53 signed message. The popup client at the bottom is a copy of
 * sdk/popup.ts in the GHOSTSIG repository, so this file needs no dependency.
 */

import { IWallet } from '../types';
import { SupportedWallet } from '../enums';
import { getState } from '../store';

const GHOSTSIG_PUBLIC = 'Public Global Stellar Network ; September 2015';

/** The page's ledger id and the SEP-43 name, by network passphrase. */
const GHOSTSIG_NETWORKS: Record<string, { id: string; name: string }> = {
  [GHOSTSIG_PUBLIC]: { id: 'mainnet', name: 'PUBLIC' },
  'Test SDF Network ; September 2015': { id: 'testnet', name: 'TESTNET' },
  'Test SDF Future Network ; October 2022': {
    id: 'futurenet',
    name: 'FUTURENET',
  },
};

/** The network a call names, else the one the dapp is on. */
function ghostsigNetwork(network: string | undefined): {
  id: string;
  name: string;
  passphrase: string;
} {
  const { config, stellar } = getState();
  const wanted =
    network ||
    stellar?.activeNetwork ||
    config.defaultNetwork ||
    config.networks[0] ||
    GHOSTSIG_PUBLIC;
  for (const [passphrase, net] of Object.entries(GHOSTSIG_NETWORKS)) {
    if (
      wanted === passphrase ||
      wanted.toLowerCase() === net.name.toLowerCase()
    )
      return { ...net, passphrase };
  }
  throw new Error(`BLUX: GHOSTSIG does not know the network "${wanted}"`);
}

let ghostsigAddress: string | null = null;

interface GhostsigAuthEntryResult extends GhostsigConnectResult {
  signature: string;
}
interface GhostsigMessageResult extends GhostsigConnectResult {
  signature: string;
}

async function ghostsigCall<T>(
  method: string,
  params: Record<string, unknown>,
  network: string | undefined,
): Promise<T> {
  const { id } = ghostsigNetwork(network);
  try {
    return await ghostsigRequest<T>({
      chain: 'stellar',
      network: id,
      method,
      params,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`BLUX: GHOSTSIG: ${message}`);
  }
}

export const ghostsigConfig: IWallet = {
  name: SupportedWallet.Ghostsig,
  website: 'https://ghostsig.dev',
  authenticateWithSignedMessage: true,

  connect: async () => {
    const result = await ghostsigCall<GhostsigConnectResult>(
      'connect',
      {},
      undefined,
    );
    ghostsigAddress = result.address;
    return result.address;
  },
  disconnect: async () => {
    ghostsigAddress = null;
  },
  getNetwork: async () => {
    const { name, passphrase } = ghostsigNetwork(undefined);
    return { network: name, passphrase };
  },
  isAvailable: async () =>
    typeof window !== 'undefined' && typeof window.open === 'function',
  signAuthEntry: async (authorizationEntry, options) => {
    const params = {
      payload: authorizationEntry,
      address: options.address || ghostsigAddress || undefined,
    };
    const result = await ghostsigCall<GhostsigAuthEntryResult>(
      'signAuthEntry',
      params,
      options.network,
    );
    return result.signature;
  },
  signMessage: async (message, options) => {
    const params = {
      message,
      address: options.address || ghostsigAddress || undefined,
    };
    const result = await ghostsigCall<GhostsigMessageResult>(
      'signMessage',
      params,
      options.network,
    );
    return result.signature;
  },
  signTransaction: async (xdr, options) => {
    const params = {
      payload: xdr,
      submit: false,
      address: options.address || ghostsigAddress || undefined,
    };
    const result = await ghostsigCall<GhostsigSignResult>(
      'sign',
      params,
      options.network,
    );
    return result.blob;
  },
};

// ghostsig-popup:begin
const GHOSTSIG_PROTOCOL = 1;
const GHOSTSIG_URL = 'https://ghostsig.dev/?connect';
/** How long a connect's popup is reused. The page holds it open a little longer than this. */
const GHOSTSIG_REUSE_MS = 1_500;
const GHOSTSIG_READY_MS = 10_000;
const GHOSTSIG_TIMEOUT_MS = 60_000;

/** SEP-43 codes: -1 internal, -2 external service, -3 bad request or unsupported, -4 rejected. */
type GhostsigCode = -1 | -2 | -3 | -4;
type GhostsigExt =
  | 'popup_blocked'
  | 'popup_closed'
  | 'timeout'
  | 'unreachable'
  | 'account_mismatch'
  | 'bad_reply';

class GhostsigError extends Error {
  readonly code: GhostsigCode;
  readonly ext?: GhostsigExt;
  constructor(code: GhostsigCode, message: string, ext?: GhostsigExt) {
    super(message);
    this.name = 'GhostsigError';
    this.code = code;
    if (ext) this.ext = ext;
  }
}

interface GhostsigConnectResult {
  address: string;
  publicKey: string;
}
interface GhostsigSubmitted {
  kind: string;
  code?: string;
  ledger?: number | string;
  ok?: boolean;
}
interface GhostsigSignResult extends GhostsigConnectResult {
  hash: string;
  blob: string;
  signature: string;
  handOver?: string;
  submitted?: GhostsigSubmitted;
}

interface GhostsigRequest {
  chain: string;
  network: string;
  method: string;
  params?: Record<string, unknown>;
  url?: string;
  timeoutMs?: number;
}

/** The popup a connect left open, for the signature a login asks for next. */
const ghostsigHeld = new WeakMap<
  Window,
  { popup: Window; origin: string; at: number }
>();

/** The pages this client opens: ghostsig.dev, or a copy on localhost, its own passkey relying party. */
function ghostsigPageUrl(url: string | undefined): URL | GhostsigError {
  let parsed: URL;
  try {
    parsed = new URL(url ?? GHOSTSIG_URL);
  } catch {
    return new GhostsigError(-3, `"${String(url)}" is not a URL`);
  }
  if (parsed.origin === new URL(GHOSTSIG_URL).origin) return parsed;
  if (parsed.hostname === 'localhost' && parsed.protocol === 'http:')
    return parsed;
  return new GhostsigError(
    -3,
    `GHOSTSIG is at ${new URL(GHOSTSIG_URL).origin}. A copy at ${parsed.origin} is not opened`,
  );
}

function ghostsigFeatures(win: Window): string {
  const width = 420;
  const height = 720;
  const outerW = win.outerWidth || win.screen?.width || width;
  const outerH = win.outerHeight || win.screen?.height || height;
  const left = Math.max(
    0,
    Math.round((win.screenX || 0) + (outerW - width) / 2),
  );
  const top = Math.max(
    0,
    Math.round((win.screenY || 0) + (outerH - height) / 2),
  );
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
}

function ghostsigId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function ghostsigCheckResult(
  method: string,
  params: Record<string, unknown>,
  result: unknown,
): GhostsigError | null {
  const r = result as Record<string, unknown> | null;
  const str = (k: string) =>
    typeof r?.[k] === 'string' && (r[k] as string).length > 0;
  if (
    !r ||
    typeof r !== 'object' ||
    !str('address') ||
    !/^[0-9a-f]{64}$/i.test(String(r.publicKey))
  ) {
    return new GhostsigError(
      -1,
      'GHOSTSIG answered without an address and a public key',
      'bad_reply',
    );
  }
  if (method !== 'connect' && !str('signature')) {
    return new GhostsigError(
      -1,
      'GHOSTSIG answered without a signature',
      'bad_reply',
    );
  }
  if (method === 'sign' && !(str('hash') && str('blob'))) {
    return new GhostsigError(
      -1,
      'GHOSTSIG answered without the signed transaction',
      'bad_reply',
    );
  }
  if (typeof params.address === 'string' && params.address !== r.address) {
    return new GhostsigError(
      -1,
      `GHOSTSIG signed as ${String(r.address)}, not as ${params.address}`,
      'account_mismatch',
    );
  }
  return null;
}

/** One request to the page. Never throws: every failure is a rejection with a GhostsigError. */
function ghostsigRequest<T = unknown>(req: GhostsigRequest): Promise<T> {
  const win = typeof window === 'undefined' ? undefined : window;
  if (!win || typeof win.open !== 'function') {
    return Promise.reject(
      new GhostsigError(
        -1,
        'This environment cannot open a popup',
        'popup_blocked',
      ),
    );
  }
  const page = ghostsigPageUrl(req.url);
  if (page instanceof GhostsigError) return Promise.reject(page);
  const url = page.href;
  const origin = page.origin;
  const params = req.params ?? {};
  const timeoutMs = req.timeoutMs ?? GHOSTSIG_TIMEOUT_MS;

  const held = ghostsigHeld.get(win);
  ghostsigHeld.delete(win);
  const reuse =
    held !== undefined &&
    !held.popup.closed &&
    held.origin === origin &&
    Date.now() - held.at < GHOSTSIG_REUSE_MS;
  let popup: Window | null;
  if (reuse) {
    popup = held.popup;
  } else {
    // A random window name. A fixed one would let any frame on the app's page take the popup over.
    try {
      popup = win.open(url, `ghostsig-${ghostsigId()}`, ghostsigFeatures(win));
    } catch {
      popup = null;
    }
    if (!popup || popup.closed) {
      return Promise.reject(
        new GhostsigError(
          -1,
          'The browser blocked the GHOSTSIG popup. Allow popups for this site and try again',
          'popup_blocked',
        ),
      );
    }
  }
  const opened = popup;

  const id = ghostsigId();
  const request = {
    ghostsig: GHOSTSIG_PROTOCOL,
    id,
    type: 'request',
    method: req.method,
    chain: req.chain,
    network: req.network,
    params,
  };

  return new Promise<T>((resolve, reject) => {
    let done = false;
    let posted = reuse;
    const finish = (err: GhostsigError | null, value?: T) => {
      if (done) return;
      done = true;
      win.removeEventListener('message', onMessage);
      clearInterval(poll);
      clearTimeout(readyTimer);
      clearTimeout(timer);
      // A connect leaves the page open. A failure of the client's own closes the popup;
      // a page that refused keeps it, to show why.
      if (!err && req.method === 'connect') {
        ghostsigHeld.set(win, { popup: opened, origin, at: Date.now() });
      } else if (err?.ext) {
        try {
          if (!opened.closed) opened.close();
        } catch {
          // a foreign window
        }
      }
      if (err) reject(err);
      else resolve(value as T);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== opened) return;
      const data = event.data as Record<string, unknown> | null;
      if (
        !data ||
        typeof data !== 'object' ||
        data.ghostsig !== GHOSTSIG_PROTOCOL
      )
        return;
      if (data.type === 'ready') {
        posted = true;
        opened.postMessage(request, origin);
        return;
      }
      if (data.id !== id) return;
      if (data.type === 'result') {
        const bad = ghostsigCheckResult(req.method, params, data.result);
        if (bad) finish(bad);
        else finish(null, data.result as T);
      } else if (data.type === 'error') {
        const e = data.error as
          { code?: unknown; message?: unknown } | undefined;
        const code =
          ([-1, -2, -3, -4] as const).find((c) => c === e?.code) ?? -1;
        finish(
          new GhostsigError(
            code,
            typeof e?.message === 'string'
              ? e.message
              : 'GHOSTSIG refused the request',
          ),
        );
      }
    };
    win.addEventListener('message', onMessage);
    if (reuse) opened.postMessage(request, origin);
    const poll = setInterval(() => {
      if (opened.closed) {
        finish(
          new GhostsigError(
            -4,
            'The GHOSTSIG popup was closed before it answered',
            'popup_closed',
          ),
        );
      }
    }, 500);
    const readyTimer = setTimeout(
      () => {
        if (!posted) {
          finish(
            new GhostsigError(
              -1,
              'GHOSTSIG did not answer. The popup lost its opener (a Cross-Origin-Opener-Policy of same-origin does that), or the page is not GHOSTSIG',
              'unreachable',
            ),
          );
        }
      },
      Math.min(GHOSTSIG_READY_MS, timeoutMs),
    );
    const timer = setTimeout(
      () =>
        finish(
          new GhostsigError(-1, 'GHOSTSIG did not answer in time', 'timeout'),
        ),
      timeoutMs,
    );
  });
}
// ghostsig-popup:end
