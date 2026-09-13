import { Federation, StrKey } from '@stellar/stellar-sdk';

import { resolveAddress } from './helpers';

const XLM_DOMAINS_DOMAIN = 'xlm.domains';
const XLM_SUFFIX = '.xlm';

/** Network options used for XLM Domains' SEP-2 federation requests. */
export type XlmNameLookupOptions = Federation.Api.Options;

type XlmNameRecordBase = {
  /** Normalized `.xlm` name, such as `alice.xlm`. */
  name: string;
  /** SEP-2 form of the name, such as `alice*xlm.domains`. */
  federationAddress: string;
  /** Validated `G...` account or `C...` contract address. */
  address: string;
  /** Optional memo returned by the federation record. */
  memo?: string;
  /** Optional SEP-2 memo type (`text`, `id`, `hash`, or `return`). */
  memoType?: string;
};

/** Details for a `.xlm` name that resolves to a classic Stellar account. */
export type XlmAccountNameRecord = XlmNameRecordBase & {
  kind: 'account';
  publicKey: string;
};

/** Details for a `.xlm` name that resolves to a Soroban contract. */
export type XlmContractNameRecord = XlmNameRecordBase & {
  kind: 'contract';
  contractId: string;
};

/** Validated details returned by an XLM Domains lookup. */
export type XlmNameRecord = XlmAccountNameRecord | XlmContractNameRecord;

const normalizedXlmName = (value: string) => {
  const name = (value ?? '').toString().trim().toLowerCase();

  if (!name.endsWith(XLM_SUFFIX)) {
    throw new Error(
      `BLUX: "${value}" is not a .xlm name. Use a name such as "alice.xlm".`,
    );
  }

  return name;
};

const federationAddressForName = (name: string) =>
  `${name.slice(0, -XLM_SUFFIX.length)}*${XLM_DOMAINS_DOMAIN}`;

const nameFromFederationAddress = (value?: string) => {
  const federationAddress = (value ?? '').trim().toLowerCase();
  const suffix = `*${XLM_DOMAINS_DOMAIN}`;

  if (!federationAddress.endsWith(suffix)) {
    throw new Error(
      'BLUX: XLM Domains returned a reverse record with an invalid Stellar address.',
    );
  }

  return normalizedXlmName(
    `${federationAddress.slice(0, -suffix.length)}${XLM_SUFFIX}`,
  );
};

/**
 * Resolves a `.xlm` name to validated Stellar payment details.
 *
 * XLM Domains is a mainnet registry, so this lookup is intentionally
 * independent of Blux's active transaction network.
 *
 * @param name - A `.xlm` name such as `alice.xlm`.
 * @param options - Optional SEP-2 timeout/connection options.
 * @returns The normalized name, federation address, resolved address kind,
 * and any memo requested by the record.
 * @throws If the name is invalid, unregistered, missing an address record, or
 * resolves to an invalid Stellar address.
 */
export const resolveXlmName = async (
  name: string,
  options: XlmNameLookupOptions = {},
): Promise<XlmNameRecord> => {
  const normalizedName = normalizedXlmName(name);
  const resolved = await resolveAddress(normalizedName, {
    ...options,
    expected: 'soroban',
  });
  const details = {
    name: normalizedName,
    federationAddress: federationAddressForName(normalizedName),
    address: resolved.address,
    memo: resolved.memo,
    memoType: resolved.memoType,
  };

  return resolved.kind === 'account'
    ? {
        ...details,
        kind: 'account',
        publicKey: resolved.publicKey,
      }
    : {
        ...details,
        kind: 'contract',
        contractId: resolved.contractId,
      };
};

/**
 * Reverse-resolves a validated `G...` account through XLM Domains.
 *
 * SEP-2 reverse lookup returns one service-selected record. If an account owns
 * multiple names, this function does not promise to return all of them. The
 * returned name is forward-resolved again before it is returned.
 *
 * @param address - A classic Stellar `G...` account address.
 * @param options - Optional SEP-2 timeout/connection options.
 * @returns One verified `.xlm` name record associated with the account.
 * @throws If the account is invalid, has no reverse record, or the returned
 * name does not forward-resolve to the same account.
 */
export const resolveXlmNameByAddress = async (
  address: string,
  options: XlmNameLookupOptions = {},
): Promise<XlmAccountNameRecord> => {
  const publicKey = (address ?? '').toString().trim();

  if (!StrKey.isValidEd25519PublicKey(publicKey)) {
    throw new Error(
      `BLUX: "${address}" is not a valid Stellar account address (G...).`,
    );
  }

  let reverseRecord: Federation.Api.Record;

  try {
    const server = await Federation.Server.createForDomain(
      XLM_DOMAINS_DOMAIN,
      options,
    );
    reverseRecord = await server.resolveAccountId(publicKey);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'lookup failed';

    throw new Error(
      `BLUX: Could not find a .xlm name for account "${publicKey}": ${reason}`,
    );
  }

  if (reverseRecord.account_id !== publicKey) {
    throw new Error(
      `BLUX: XLM Domains returned an invalid reverse record for account "${publicKey}".`,
    );
  }

  const name = nameFromFederationAddress(
    (reverseRecord as Federation.Api.Record & { stellar_address?: string })
      .stellar_address,
  );
  const verified = await resolveXlmName(name, options);

  if (verified.kind !== 'account' || verified.publicKey !== publicKey) {
    throw new Error(
      `BLUX: Reverse-resolved name "${name}" does not point to account "${publicKey}".`,
    );
  }

  return verified;
};
