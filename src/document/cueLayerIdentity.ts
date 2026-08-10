const CUE_LAYER_ID_PREFIX = "layer_";
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const RANDOM_BYTE_COUNT = 10;

export type CueLayerRandomFill = (bytes: Uint8Array) => void;

/**
 * Creates a non-semantic Cue Layer identity once at the Layer creation boundary.
 * Existing Layer identities are intentionally never normalized or regenerated.
 */
export function createOpaqueCueLayerId(
  existingIds: Iterable<string>,
  fillRandom: CueLayerRandomFill = fillRandomBytes,
) {
  const occupied = new Set(existingIds);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const bytes = new Uint8Array(RANDOM_BYTE_COUNT);
    fillRandom(bytes);
    const candidate = `${CUE_LAYER_ID_PREFIX}${encodeBase32(bytes)}`;
    if (!occupied.has(candidate)) return candidate;
  }
  throw new Error("Could not allocate a unique Cue Layer identity");
}

export function isOpaqueCueLayerId(value: string) {
  return /^layer_[a-z2-7]{16}$/.test(value);
}

function fillRandomBytes(bytes: Uint8Array) {
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
    return;
  }
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
}

function encodeBase32(bytes: Uint8Array) {
  let buffer = 0;
  let bitCount = 0;
  let output = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      output += BASE32_ALPHABET[(buffer >>> bitCount) & 31];
    }
    buffer &= (1 << bitCount) - 1;
  }
  if (bitCount > 0) output += BASE32_ALPHABET[(buffer << (5 - bitCount)) & 31];
  return output;
}
