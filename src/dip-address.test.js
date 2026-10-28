import test from "node:test";
import assert from "node:assert/strict";
import { addressToBinary, addressToBits, bitsToAddress, validateDeviceAddress } from "./dip-address.js";

const cases = [[0, "00000000", [1, 2, 3, 4, 5, 6, 7, 8]], [1, "00000001", [2, 3, 4, 5, 6, 7, 8]], [5, "00000101", [2, 4, 5, 6, 7, 8]], [10, "00001010", [1, 3, 5, 6, 7, 8]], [37, "00100101", [2, 4, 5, 7, 8]], [128, "10000000", [1, 2, 3, 4, 5, 6, 7]], [255, "11111111", []]];

for (const [address, binary, upperSwitches] of cases) {
  test(`address ${address} maps to ${binary} with upper switches representing 0`, () => {
    assert.equal(addressToBinary(address), binary);
    assert.deepEqual(addressToBits(address).flatMap((upper, index) => upper ? [index + 1] : []), upperSwitches);
    assert.equal(bitsToAddress(addressToBits(address)), address);
  });
}

test("device addresses enforce the application's reserved 1–254 range", () => {
  for (const invalid of [0, 255, -1, 1.2, NaN, ""]) assert.throws(() => validateDeviceAddress(invalid));
  assert.equal(validateDeviceAddress(1), 1);
  assert.equal(validateDeviceAddress(254), 254);
});

test("conversion rejects values that cannot fit in eight bits and malformed states", () => {
  for (const invalid of [-1, 256, 2.5, NaN]) assert.throws(() => addressToBinary(invalid));
  assert.throws(() => bitsToAddress([true]));
  assert.throws(() => bitsToAddress(Array(8).fill(0)));
});

test("all 256 DIP patterns use switch 1 as LSB and raised as zero", () => {
  for (let address = 0; address <= 255; address += 1) {
    const raisedSwitches = addressToBits(address);
    const expected = Array.from({ length: 8 }, (_, index) => (address & (1 << index)) === 0);
    assert.deepEqual(raisedSwitches, expected, `address ${address}`);
    assert.equal(bitsToAddress(raisedSwitches), address, `address ${address}`);
  }
});
