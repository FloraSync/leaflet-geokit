// Minimal type shim for 'uuid' to satisfy TypeScript in case ambient types are not resolved.
declare module "uuid" {
  export function v4(): string;
}
