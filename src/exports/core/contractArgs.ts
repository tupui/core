import { contract, rpc, xdr } from '@stellar/stellar-sdk';

/**
 * Contract specs are only shared while they are being fetched. This avoids
 * duplicate RPC work for batched reads without keeping a stale spec after a
 * contract upgrades its Wasm.
 */
const inFlightSpecs = new WeakMap<
  rpc.Server,
  Map<string, Promise<contract.Spec>>
>();

const getContractSpec = (
  address: string,
  soroban: rpc.Server,
  networkPassphrase: string,
): Promise<contract.Spec> => {
  let specs = inFlightSpecs.get(soroban);
  if (!specs) {
    specs = new Map();
    inFlightSpecs.set(soroban, specs);
  }

  const cached = specs.get(address);
  if (cached) {
    return cached;
  }

  const pending = contract.Client.from({
    contractId: address,
    networkPassphrase,
    rpcUrl: soroban.serverURL.toString(),
    server: soroban,
  }).then((client) => client.spec);

  specs.set(address, pending);

  const clear = () => {
    if (specs?.get(address) === pending) {
      specs.delete(address);
    }
  };
  void pending.then(clear, clear);

  return pending;
};

const normalizeInteger = (value: unknown, type: xdr.ScSpecTypeDef): unknown => {
  const isIntegerType =
    type.type === 'scSpecTypeU32' ||
    type.type === 'scSpecTypeI32' ||
    type.type === 'scSpecTypeU64' ||
    type.type === 'scSpecTypeI64' ||
    type.type === 'scSpecTypeU128' ||
    type.type === 'scSpecTypeI128' ||
    type.type === 'scSpecTypeU256' ||
    type.type === 'scSpecTypeI256' ||
    type.type === 'scSpecTypeTimepoint' ||
    type.type === 'scSpecTypeDuration';

  if (!isIntegerType) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(
        `Number ${value} is not a safe integer; pass it as a bigint or decimal string instead`,
      );
    }
    return value;
  }

  // The Stellar SDK accepts decimal strings for wide integers, but its
  // spec encoder expects u32/i32 values as numbers. Coerce those two only
  // after BigInt has verified that the string contains an integer.
  if (typeof value === 'string') {
    const decimal = value.trim();
    if (!/^[+-]?\d+$/.test(decimal)) {
      throw new TypeError(`Expected a decimal integer, received "${value}"`);
    }

    const integer = BigInt(decimal);

    if (type.type === 'scSpecTypeU32') {
      if (integer < BigInt(0) || integer > BigInt(4_294_967_295)) {
        throw new RangeError(`Value ${value} is out of range for u32`);
      }
      return Number(integer);
    }

    if (type.type === 'scSpecTypeI32') {
      if (integer < BigInt(-2_147_483_648) || integer > BigInt(2_147_483_647)) {
        throw new RangeError(`Value ${value} is out of range for i32`);
      }
      return Number(integer);
    }

    return decimal;
  }

  return value;
};

const describeType = (type: xdr.ScSpecTypeDef): string =>
  type.type.replace('scSpecType', '').toLowerCase();

/**
 * Converts positional native arguments into ScVals using the deployed
 * contract's spec. Existing ScVals pass through unchanged.
 */
export const contractArgsToScVals = async (
  address: string,
  fn: string,
  args: unknown[],
  soroban: rpc.Server,
  networkPassphrase: string,
  callLabel: string,
): Promise<xdr.ScVal[]> => {
  if (!Array.isArray(args)) {
    throw new Error(`BLUX: ${callLabel}.args must be an array`);
  }

  // Preserve the old API without adding contract-spec requests for callers
  // that already encode every argument themselves.
  if (args.every((arg) => xdr.ScVal.is(arg))) {
    return args;
  }

  const spec = await getContractSpec(address, soroban, networkPassphrase);
  const inputs = spec.getFunc(fn).inputs;

  if (args.length !== inputs.length) {
    throw new Error(
      `BLUX: ${callLabel}.args expected ${inputs.length} value${inputs.length === 1 ? '' : 's'} for ${address}.${fn}, received ${args.length}`,
    );
  }

  return inputs.map((input, index) => {
    const value = args[index];
    if (xdr.ScVal.is(value)) {
      return value;
    }

    try {
      return spec.nativeToScVal(
        normalizeInteger(value, input.type),
        input.type,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `BLUX: Could not encode ${callLabel}.args[${index}] (${input.name.toString()}: ${describeType(input.type)}): ${message}`,
      );
    }
  });
};
