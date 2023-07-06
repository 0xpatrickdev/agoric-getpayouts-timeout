# E(zcfSeat).getPayouts() promise timeout

Simple contract that demonstrates a promise timeout that occurs when .getPayouts() is called on a seat that the contract or user has not exited. Ava eventually throws an error - `Error: Promise returned by test never resolved at process.emit (node:events:513:28)` with no stacktrace to the contract or agoric-sdk.

The behavior might be intended, but I thought the api would maybe fail fast with a warning that the seat was not exited. Naively, it seems like maybe adding the inverse of [`assertHasNotExited`](https://github.com/Agoric/agoric-sdk/blob/c50ca190ec2254d16e6d15d8f1235fcb4aa63560/packages/zoe/src/zoeService/zoeSeat.js#L48-L51), `assertHasExited`, in the [`getPayout` and `getPayouts` handlers](https://github.com/Agoric/agoric-sdk/blob/c50ca190ec2254d16e6d15d8f1235fcb4aa63560/packages/zoe/src/zoeService/zoeSeat.js#L265-L285) could resolve the issue.

# Contract Mechanics

The contract creator locks collateral in the contract and cannot claim it until `expirationTime`.

In the happy path, Alice waits until expiration time and then exits the contract, claiming her collateral. In the unhappy path, tests one and two, Alice tries to exit her seat early and is expecting to get an error.

# Getting Started

```bash
agoric install

cd contract && yarn test:watch
```