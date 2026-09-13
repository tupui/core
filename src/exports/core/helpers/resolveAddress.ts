import { StrKey, Federation, extractBaseAddress } from '@stellar/stellar-sdk';

const XLM_DOMAINS_FEDERATION_DOMAIN = 'xlm.domains';
const XLM_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const XLM_NAME_PATTERN = new RegExp(
  `^(?:${XLM_LABEL}\\.)*${XLM_LABEL}\\.xlm$`,
  'i',
);

/** Which kind of Stellar address a caller is able to consume. */
export type AddressExpectation = 'account' | 'contract' | 'soroban';

/** Federation options plus the address kind required by the calling API. */
export type ResolveAddressOptions = Federation.Api.Options & {
  /**
   * `account` accepts `G...`/`M...`, `contract` accepts only `C...`, and
   * `soroban` accepts either `G...` or `C...` (but not muxed accounts).
   * Defaults to `account` for backwards compatibility.
   */
  expected?: AddressExpectation;
};

type ResolvedAddressBase = {
  /** The normalized ledger address: a base `G...` account or `C...` contract. */
  address: string;
  /**
   * The address to drop into an operation. A muxed (`M...`) input is preserved
   * here so its embedded memo id survives a classic payment.
   */
  destination: string;
  /** The memo a federation record asks senders to attach, when it provided one. */
  memo?: string;
  /** The type of {@link ResolvedAddressBase.memo} (`text` | `id` | `hash` | `return`). */
  memoType?: string;
  /** `true` when the input required a SEP-2 federation lookup. */
  federated: boolean;
};

/** A resolved classic account address. */
export type ResolvedAccountAddress = ResolvedAddressBase & {
  kind: 'account';
  /** The underlying Ed25519 account id (`G...`). */
  publicKey: string;
};

/** A resolved Soroban contract address. */
export type ResolvedContractAddress = ResolvedAddressBase & {
  kind: 'contract';
  /** The resolved contract id (`C...`). */
  contractId: string;
};

/** The outcome of resolving an account, contract, federated address, or `.xlm` name. */
export type ResolvedAddress = ResolvedAccountAddress | ResolvedContractAddress;

type AccountAddressOptions = ResolveAddressOptions & {
  expected?: 'account';
};

type ContractAddressOptions = ResolveAddressOptions & {
  expected: 'contract';
};

type SorobanAddressOptions = ResolveAddressOptions & {
  expected: 'soroban';
};

const invalidXlmName = (name: string): Error =>
  new Error(
    `BLUX: "${name}" is not a valid .xlm name. Use a name such as "alice.xlm".`,
  );

/** Converts `.xlm` display notation into the service's SEP-2 address. */
const toFederationAddress = (
  value: string,
): { address: string; xlmName: boolean } => {
  if (!value.toLowerCase().endsWith('.xlm')) {
    return { address: value, xlmName: false };
  }

  if (value.length > 253 || !XLM_NAME_PATTERN.test(value)) {
    throw invalidXlmName(value);
  }

  const name = value.slice(0, -'.xlm'.length).toLowerCase();

  return {
    address: `${name}*${XLM_DOMAINS_FEDERATION_DOMAIN}`,
    xlmName: true,
  };
};

const asResolvedAddress = (
  address: string,
  details: Pick<ResolvedAddressBase, 'federated' | 'memo' | 'memoType'>,
): ResolvedAddress => {
  if (StrKey.isValidEd25519PublicKey(address)) {
    return {
      address,
      destination: address,
      publicKey: address,
      kind: 'account',
      ...details,
    };
  }

  if (StrKey.isValidMed25519PublicKey(address)) {
    const publicKey = extractBaseAddress(address);

    return {
      address: publicKey,
      destination: address,
      publicKey,
      kind: 'account',
      ...details,
    };
  }

  if (StrKey.isValidContract(address)) {
    return {
      address,
      destination: address,
      contractId: address,
      kind: 'contract',
      ...details,
    };
  }

  throw new Error(`BLUX: Resolved an invalid Stellar address "${address}".`);
};

const assertExpectedAddress = (
  input: string,
  resolved: ResolvedAddress,
  expected: AddressExpectation,
): void => {
  if (expected === 'account' && resolved.kind !== 'account') {
    throw new Error(
      `BLUX: "${input}" resolves to a contract address (C...), but this field requires an account address (G... or M...).`,
    );
  }

  if (expected === 'contract' && resolved.kind !== 'contract') {
    throw new Error(
      `BLUX: "${input}" resolves to an account address (G...), but this field requires a contract address (C...).`,
    );
  }

  if (
    expected === 'soroban' &&
    resolved.kind === 'account' &&
    StrKey.isValidMed25519PublicKey(resolved.destination)
  ) {
    throw new Error(
      `BLUX: "${input}" is a muxed account (M...), which cannot be used as a Soroban address.`,
    );
  }
};

/**
 * Resolves Stellar addresses through one shared path:
 *
 * - Valid `G...`, `M...`, and `C...` addresses are validated locally.
 * - SEP-2 addresses such as `alice*example.com` use the domain's federation
 *   server.
 * - `.xlm` names such as `alice.xlm` are translated to
 *   `alice*xlm.domains` and resolved through XLM Domains' SEP-2 service.
 *
 * XLM Domains currently stores its registry on Stellar mainnet. Resolution is
 * therefore intentionally independent of the transaction network: a testnet
 * call resolves the same record, after which the selected network determines
 * whether that account or contract can actually be used there.
 *
 * @param value - A Stellar address, SEP-2 address, or `.xlm` name.
 * @param options - Federation connection options and the required address kind.
 * @returns Validated, normalized address details.
 * @throws If the input is invalid, the name has no record, or its record has the wrong address kind.
 */
export function resolveAddress(
  value: string,
  options?: AccountAddressOptions,
): Promise<ResolvedAccountAddress>;
export function resolveAddress(
  value: string,
  options: ContractAddressOptions,
): Promise<ResolvedContractAddress>;
export function resolveAddress(
  value: string,
  options: SorobanAddressOptions,
): Promise<ResolvedAddress>;
export function resolveAddress(
  value: string,
  options: ResolveAddressOptions,
): Promise<ResolvedAddress>;
export async function resolveAddress(
  value: string,
  options: ResolveAddressOptions = {},
): Promise<ResolvedAddress> {
  const trimmed = (value ?? '').toString().trim();

  if (!trimmed) {
    throw new Error('BLUX: A Stellar address or .xlm name is required.');
  }

  const expected = options.expected ?? 'account';
  const { expected: _expected, ...federationOptions } = options;

  if (
    StrKey.isValidEd25519PublicKey(trimmed) ||
    StrKey.isValidMed25519PublicKey(trimmed) ||
    StrKey.isValidContract(trimmed)
  ) {
    const resolved = asResolvedAddress(trimmed, { federated: false });
    assertExpectedAddress(trimmed, resolved, expected);
    return resolved;
  }

  const federation = toFederationAddress(trimmed);

  if (!federation.address.includes('*')) {
    throw new Error(
      `BLUX: "${trimmed}" is not a valid Stellar address, federated address, or .xlm name.`,
    );
  }

  let record: Federation.Api.Record;

  try {
    record = await Federation.Server.resolve(
      federation.address,
      federationOptions,
    );
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'lookup failed';
    const subject = federation.xlmName
      ? `.xlm name "${trimmed}"`
      : `federated address "${trimmed}"`;

    throw new Error(
      `BLUX: Could not resolve ${subject}; it is invalid or has no address record: ${reason}`,
    );
  }

  if (!record.account_id) {
    const subject = federation.xlmName
      ? `.xlm name "${trimmed}"`
      : `federated address "${trimmed}"`;

    throw new Error(
      `BLUX: Could not resolve ${subject}; it has no address record.`,
    );
  }

  const resolved = asResolvedAddress(record.account_id, {
    memo: record.memo,
    memoType: record.memo_type,
    federated: true,
  });

  assertExpectedAddress(trimmed, resolved, expected);
  return resolved;
}

/**
 * Resolves an optional account field to its base `G...` key. This is used by
 * Horizon filters such as `forAccount`, `forIssuer`, `sponsor`, and `claimant`.
 */
export const resolveAddressKey = async (
  address?: string,
): Promise<string | undefined> => {
  if (!address) {
    return undefined;
  }

  return (await resolveAddress(address, { expected: 'account' })).publicKey;
};
