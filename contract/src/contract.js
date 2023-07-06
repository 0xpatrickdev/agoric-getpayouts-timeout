// @ts-check
/* global harden */
import '@agoric/zoe/exported.js';
import { M } from '@agoric/store';
import { atomicTransfer } from '@agoric/zoe/src/contractSupport/index.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

const makeWaker = (name, func) => {
  return Far(name, {
    wake: (timestamp) => func(timestamp),
  });
};

/**
 * This is a simple contract that takes a collateralAmount, and locks it in
 * in the contract until the expirationTime.
 *
 * @type {ContractStartFn}
 */
const start = async (zcf) => {
  const { zcfSeat: collateralSeat } = zcf.makeEmptySeatKit();
  const { expirationTime, timerService, collateralAmount } = zcf.getTerms();

  const expirationWaker = (depositorSeat) =>
    makeWaker('expirationWaker', (_timestamp) => {
      atomicTransfer(zcf, collateralSeat, depositorSeat, {
        Collateral: collateralSeat.getAmountAllocated('Collateral'),
      });
      depositorSeat.exit();
      zcf.shutdown(`Escrowed Collateral is now claimable.`);
    });

  /** @type {OfferHandler} */
  const lockCollateral = (depositorSeat) => {
    atomicTransfer(zcf, depositorSeat, collateralSeat, {
      Collateral: depositorSeat.getAmountAllocated('Collateral'),
    });

    E(timerService).setWakeup(expirationTime, expirationWaker(depositorSeat));
    // Since the user is getting the payout through Zoe, we can
    // return anything here. Let's return some helpful instructions.

    return Far('depositorFacet', {
      getCollateralAmount: () =>
        collateralSeat.getAmountAllocated('Collateral'),
    });
  };

  const creatorFacet = Far('creatorFacet', {
    makeLockCollateralInvitation: () =>
      zcf.makeInvitation(
        lockCollateral,
        'lockCollateral',
        { expirationTime },
        harden({
          give: { Collateral: M.gte(collateralAmount) },
          want: {},
          exit: M.any(),
        }),
      ),
  });

  const publicFacet = Far('publicFacet', {});

  // Return the creatorFacet to the creator, so they can make
  // invitations for others to get payments of tokens. Publish the
  // publicFacet.
  return harden({ creatorFacet, publicFacet });
};

harden(start);
export { start };
