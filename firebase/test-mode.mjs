// Synthetic fixture digest only; never a real-data migration hash.
export const TEST_SOURCE_HASH = "556ddf286d0d0a8b98e515870ce212f10318f3aba7fc007356df1d54413e2479";
export function syntheticTestConfig(verifiedConfig) { return {...verifiedConfig,enabled:true,authOnly:false,testOnly:true}; }
export const ALL_READY_SOURCE_HASH = '4f95f0112a5f7d243e9a6f4007dab81b5cf61a35644026127a9e82b35d62bdb7';
export const TEST_SOURCE_HASHES = Object.freeze([TEST_SOURCE_HASH, ALL_READY_SOURCE_HASH]);
