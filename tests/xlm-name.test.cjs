const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const stellar = require('@stellar/stellar-sdk');

const source = resolve(__dirname, '../src/exports/core/resolveXlmName.ts');

function loadXlmNames({ resolveAddress, createForDomain }) {
  const { outputText } = ts.transpileModule(readFileSync(source, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const module = { exports: {} };
  const sdk = {
    ...stellar,
    Federation: {
      ...stellar.Federation,
      Server: {
        createForDomain,
      },
    },
  };

  vm.runInNewContext(
    outputText,
    {
      module,
      exports: module.exports,
      Error,
      require: (name) => {
        if (name === '@stellar/stellar-sdk') return sdk;
        if (name === './helpers') return { resolveAddress };

        throw new Error(`Unexpected test import: ${name}`);
      },
    },
    { filename: source },
  );

  return module.exports;
}

const unusedServer = async () => {
  throw new Error('unexpected reverse lookup');
};

test('resolveXlmName returns normalized account and memo details', async () => {
  const account = stellar.Keypair.random().publicKey();
  const calls = [];
  const api = loadXlmNames({
    createForDomain: unusedServer,
    resolveAddress: async (name, options) => {
      calls.push({ name, options });
      return {
        address: account,
        destination: account,
        publicKey: account,
        kind: 'account',
        federated: true,
        memo: 'invoice-7',
        memoType: 'text',
      };
    },
  });

  const result = await api.resolveXlmName(' Bot-1.Team.XLM ', {
    timeout: 1234,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'bot-1.team.xlm');
  assert.equal(calls[0].options.timeout, 1234);
  assert.equal(calls[0].options.expected, 'soroban');
  assert.equal(result.name, 'bot-1.team.xlm');
  assert.equal(result.federationAddress, 'bot-1.team*xlm.domains');
  assert.equal(result.address, account);
  assert.equal(result.publicKey, account);
  assert.equal(result.kind, 'account');
  assert.equal(result.memo, 'invoice-7');
  assert.equal(result.memoType, 'text');
});

test('resolveXlmName preserves contract result details', async () => {
  const contract = stellar.StrKey.encodeContract(Buffer.alloc(32, 4));
  const api = loadXlmNames({
    createForDomain: unusedServer,
    resolveAddress: async () => ({
      address: contract,
      destination: contract,
      contractId: contract,
      kind: 'contract',
      federated: true,
    }),
  });

  const result = await api.resolveXlmName('token.xlm');

  assert.equal(result.address, contract);
  assert.equal(result.contractId, contract);
  assert.equal(result.kind, 'contract');
});

test('resolveXlmName rejects non-.xlm inputs before federation', async () => {
  let lookups = 0;
  const api = loadXlmNames({
    createForDomain: unusedServer,
    resolveAddress: async () => {
      lookups += 1;
    },
  });

  await assert.rejects(
    api.resolveXlmName('alice*example.com'),
    /not a \.xlm name/,
  );
  assert.equal(lookups, 0);
});

test('resolveXlmNameByAddress resolves and forward-verifies a record', async () => {
  const account = stellar.Keypair.random().publicKey();
  const serverCalls = [];
  const forwardCalls = [];
  const api = loadXlmNames({
    createForDomain: async (domain, options) => {
      serverCalls.push({ domain, options });
      return {
        resolveAccountId: async (publicKey) => ({
          stellar_address: 'alice*xlm.domains',
          account_id: publicKey,
        }),
      };
    },
    resolveAddress: async (name, options) => {
      forwardCalls.push({ name, options });
      return {
        address: account,
        destination: account,
        publicKey: account,
        kind: 'account',
        federated: true,
      };
    },
  });

  const result = await api.resolveXlmNameByAddress(account, { timeout: 4321 });

  assert.equal(serverCalls.length, 1);
  assert.equal(serverCalls[0].domain, 'xlm.domains');
  assert.equal(serverCalls[0].options.timeout, 4321);
  assert.equal(forwardCalls.length, 1);
  assert.equal(forwardCalls[0].name, 'alice.xlm');
  assert.equal(result.name, 'alice.xlm');
  assert.equal(result.address, account);
});

test('reverse lookup validates G addresses without making a request', async () => {
  let lookups = 0;
  const api = loadXlmNames({
    createForDomain: async () => {
      lookups += 1;
    },
    resolveAddress: async () => {
      throw new Error('unexpected forward lookup');
    },
  });

  await assert.rejects(
    api.resolveXlmNameByAddress(
      'CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ),
    /valid Stellar account address \(G\.\.\.\)/,
  );
  assert.equal(lookups, 0);
});

test('missing and malformed reverse records fail clearly', async () => {
  const account = stellar.Keypair.random().publicKey();
  const missing = loadXlmNames({
    createForDomain: async () => ({
      resolveAccountId: async () => {
        throw new Error('404 Not Found');
      },
    }),
    resolveAddress: async () => {
      throw new Error('unexpected forward lookup');
    },
  });
  await assert.rejects(
    missing.resolveXlmNameByAddress(account),
    /Could not find a \.xlm name.*404 Not Found/,
  );

  const malformed = loadXlmNames({
    createForDomain: async () => ({
      resolveAccountId: async () => ({
        stellar_address: 'alice*example.com',
        account_id: account,
      }),
    }),
    resolveAddress: async () => {
      throw new Error('unexpected forward lookup');
    },
  });
  await assert.rejects(
    malformed.resolveXlmNameByAddress(account),
    /reverse record with an invalid Stellar address/,
  );
});

test('reverse records must forward-resolve to the requested account', async () => {
  const account = stellar.Keypair.random().publicKey();
  const otherAccount = stellar.Keypair.random().publicKey();
  const api = loadXlmNames({
    createForDomain: async () => ({
      resolveAccountId: async () => ({
        stellar_address: 'alice*xlm.domains',
        account_id: account,
      }),
    }),
    resolveAddress: async () => ({
      address: otherAccount,
      destination: otherAccount,
      publicKey: otherAccount,
      kind: 'account',
      federated: true,
    }),
  });

  await assert.rejects(
    api.resolveXlmNameByAddress(account),
    /does not point to account/,
  );
});
