// Conversion helpers for the map's 8-bit address editor.
// Switch 1 is the LSB and switch 8 is the MSB. A raised actuator (true)
// represents 0; a lowered actuator (false) represents 1.
export function addressToBinary(address) {
  const value = Number(address);
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new RangeError("An 8-bit address must be an integer from 0 to 255.");
  return value.toString(2).padStart(8, "0");
}

export function addressToBits(address) {
  return [...addressToBinary(address)].reverse().map((bit) => bit === "0");
}

export function bitsToAddress(bits) {
  if (!Array.isArray(bits) || bits.length !== 8 || bits.some((bit) => typeof bit !== "boolean")) throw new TypeError("Exactly eight Boolean switch states are required.");
  return bits.reduce((value, raised, index) => value | (Number(!raised) << index), 0);
}

// The application reserves addresses 0 and 255; loop cards accept 1–254.
export function validateDeviceAddress(address) {
  const value = Number(address);
  if (!Number.isInteger(value) || value < 1 || value > 254) throw new RangeError("Device address must be a whole number from 1 to 254.");
  return value;
}
