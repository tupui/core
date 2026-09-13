const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const stellar = require('@stellar/stellar-sdk');

const source = resolve(
  __dirname,
  '../src/exports/core/helpers/resolveAddress.ts',
);

function loadResolver(resolveFederation) {
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
        ...stellar.Federation.Server,
        resolve: resolveFederation,
      },
    },
  };

  vm.runInNewContext(
    outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        assert.equal(name, '@stellar/stellar-sdk');
        return sdk;
      },
    },
    { filename: source },
  );

  return module.exports.resolveAddress;
}

test('valid account and contract addresses are accepted without federation', async () => {
  let lookups = 0;
  const resolveAddress = loadResolver(async () => {
    lookups += 1;
    throw new Error('unexpected lookup');
  });
  const account = stellar.Keypair.random().publicKey();
  const contract = stellar.StrKey.encodeContract(Buffer.alloc(32, 7));

  assert.equal((await resolveAddress(account)).publicKey, account);
  assert.equal(
    (await resolveAddress(contract, { expected: 'contract' })).contractId,
    contract,
  );
  assert.equal(lookups, 0);
});

test('.xlm names use the XLM Domains SEP-2 address and preserve options', async () => {
  const account = stellar.Keypair.random().publicKey();
  const requests = [];
  const resolveAddress = loadResolver(async (address, options) => {
    requests.push({ address, options });
    return {
      stellar_address: address,
      account_id: account,
      memo_type: 'text',
      memo: 'invoice-7',
    };
  });

  const result = await resolveAddress('Bot-1.Team.XLM', {
    expected: 'account',
    timeout: 1234,
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].address, 'bot-1.team*xlm.domains');
  assert.equal(requests[0].options.timeout, 1234);
  assert.equal('expected' in requests[0].options, false);
  assert.equal(result.publicKey, account);
  assert.equal(result.memo, 'invoice-7');
  assert.equal(result.federated, true);
});

test('.xlm records can resolve to contracts for Soroban fields', async () => {
  const contract = stellar.StrKey.encodeContract(Buffer.alloc(32, 9));
  const resolveAddress = loadResolver(async (address) => ({
    stellar_address: address,
    account_id: contract,
  }));

  const result = await resolveAddress('token.xlm', { expected: 'contract' });
  assert.equal(result.contractId, contract);
});

test('invalid, unregistered, missing, and wrong-kind records throw', async () => {
  const account = stellar.Keypair.random().publicKey();
  let lookups = 0;
  const invalid = loadResolver(async () => {
    lookups += 1;
    return { account_id: account };
  });

  await assert.rejects(invalid('-bad.xlm'), /not a valid \.xlm name/);
  assert.equal(lookups, 0);

  const unregistered = loadResolver(async () => {
    throw new Error('Request failed with status code 404');
  });
  await assert.rejects(
    unregistered('missing.xlm'),
    /invalid or has no address record/,
  );

  const missing = loadResolver(async () => ({}));
  await assert.rejects(missing('empty.xlm'), /has no address record/);

  const wrongKind = loadResolver(async (address) => ({
    stellar_address: address,
    account_id: account,
  }));
  await assert.rejects(
    wrongKind('account.xlm', { expected: 'contract' }),
    /requires a contract address/,
  );
});
