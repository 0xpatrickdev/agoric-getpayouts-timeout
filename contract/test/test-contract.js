// @ts-check

/* eslint-disable import/order -- https://github.com/endojs/endo/issues/1235 */
import { test } from './prepare-test-env-ava.js';
import path from 'path';

import bundleSource from '@endo/bundle-source';

import { E } from '@endo/eventual-send';
import { makeFakeVatAdmin } from '@agoric/zoe/tools/fakeVatAdmin.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { makeIssuerKit, AmountMath } from '@agoric/ertp';
import { buildManualTimer } from '@agoric/swingset-vat/tools/manual-timer.js';

const filename = new URL(import.meta.url).pathname;
const dirname = path.dirname(filename);

const contractPath = `${dirname}/../src/contract.js`;
const bundleId = 'getPayoutsTest';

const setupTest = async (t) => {
  const { admin: fakeVatAdmin, vatAdminState } = makeFakeVatAdmin();
  const { zoeService: zoe } = makeZoeKitForTest(fakeVatAdmin);
  const mockChainTimerService = buildManualTimer(console.log);

  // make test currency for alice
  const moolahKit = makeIssuerKit('Moolah');
  const oneThousandMoolah = AmountMath.make(moolahKit.brand, 1_000n);
  const zeroMoolah = AmountMath.make(moolahKit.brand, 0n);
  const moolahPayment = moolahKit.mint.mintPayment(oneThousandMoolah);

  const contractBundle = await bundleSource(contractPath);
  vatAdminState.installBundle(bundleId, contractBundle);
  const installation = await E(zoe).install(contractBundle);
  return {
    moolahKit,
    oneThousandMoolah,
    zeroMoolah,
    moolahPayment,
    mockChainTimerService,
    installation,
    zoe,
  };
};

test('lock and claim collateral - happy path ', async (t) => {
  const {
    moolahKit,
    oneThousandMoolah,
    moolahPayment,
    mockChainTimerService,
    installation,
    zoe,
  } = await setupTest(t);

  const issuerKeywordRecord = harden({ Collateral: moolahKit.issuer });
  const terms = {
    collateralAmount: oneThousandMoolah,
    expirationTime: 5n,
    timerService: mockChainTimerService,
  };

  const { creatorFacet } = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
    terms,
  );

  // Alice makes an invitation to escrow collateral
  const invitation = E(creatorFacet).makeLockCollateralInvitation();

  // Alice makes an offer using the invitation
  const proposal = harden({ give: { Collateral: oneThousandMoolah } });
  const payment = harden({ Collateral: moolahPayment });
  const aliceSeat = E(zoe).offer(invitation, proposal, payment);

  const depositorFacet = await E(aliceSeat).getOfferResult();
  const amt = await E(depositorFacet).getCollateralAmount();
  t.deepEqual(
    amt,
    oneThousandMoolah,
    "Collateral seat should contain Alice's Moolah",
  );

  // fast-forward to the expiration time
  mockChainTimerService.advanceTo(terms.expirationTime);
  const { Collateral: alicesClaimedCollateral } = await E(
    aliceSeat,
  ).getPayouts();
  t.deepEqual(
    await moolahKit.issuer.getAmountOf(alicesClaimedCollateral),
    oneThousandMoolah,
    'Alice should have her Moolah back.',
  );
});

test('lock and claim collateral too early - promise timeout ', async (t) => {
  const {
    moolahKit,
    oneThousandMoolah,
    zeroMoolah,
    moolahPayment,
    mockChainTimerService,
    installation,
    zoe,
  } = await setupTest(t);

  const issuerKeywordRecord = harden({ Collateral: moolahKit.issuer });
  const terms = {
    collateralAmount: oneThousandMoolah,
    expirationTime: 5n,
    timerService: mockChainTimerService,
  };

  const { creatorFacet } = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
    terms,
  );

  // Alice makes an invitation to escrow collateral
  const invitation = E(creatorFacet).makeLockCollateralInvitation();

  // Alice makes an offer using the invitation
  const proposal = harden({ give: { Collateral: oneThousandMoolah } });
  const payment = harden({ Collateral: moolahPayment });
  const aliceSeat = E(zoe).offer(invitation, proposal, payment);

  // fast-forward to 1s before expiration time
  mockChainTimerService.advanceTo(terms.expirationTime - 1n);
  // .getPayouts() results in  Error: Promise returned by test never resolved
  // at process.emit (node:events:513:28)
  const { Collateral: alicesClaimedCollateral } = await E(
    aliceSeat,
  ).getPayouts();
  t.deepEqual(
    await moolahKit.issuer.getAmountOf(alicesClaimedCollateral),
    zeroMoolah,
    'Alice should not have her Moolah back yet.',
  );
});

test('lock and claim collateral too early - no promise timeout when tryExit is called first ', async (t) => {
  const {
    moolahKit,
    oneThousandMoolah,
    zeroMoolah,
    moolahPayment,
    mockChainTimerService,
    installation,
    zoe,
  } = await setupTest(t);

  const issuerKeywordRecord = harden({ Collateral: moolahKit.issuer });
  const terms = {
    collateralAmount: oneThousandMoolah,
    expirationTime: 5n,
    timerService: mockChainTimerService,
  };

  const { creatorFacet } = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
    terms,
  );

  // Alice makes an invitation to escrow collateral
  const invitation = E(creatorFacet).makeLockCollateralInvitation();

  // Alice makes an offer using the invitation
  const proposal = harden({ give: { Collateral: oneThousandMoolah } });
  const payment = harden({ Collateral: moolahPayment });
  const aliceSeat = E(zoe).offer(invitation, proposal, payment);

  // fast-forward to 1s before expiration time
  mockChainTimerService.advanceTo(terms.expirationTime - 1n);
  // call tryExit first, getPayouts fires successfully
  await E(aliceSeat).tryExit();
  const { Collateral: alicesClaimedCollateral } = await E(
    aliceSeat,
  ).getPayouts();
  t.deepEqual(
    await moolahKit.issuer.getAmountOf(alicesClaimedCollateral),
    zeroMoolah,
    'Alice should not have her Moolah back yet.',
  );
});
