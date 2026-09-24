import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertHostCompatibility } from '../HostCompatibility';

describe('host capability admission', () => {
  const storage = { getSecret: () => null, setSecret: () => {} };
  it('admits Geode-compatible manifests without requiring an Obsidian release number', () => {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
    expect(manifest.minAppVersion).toBe('1.10.2');
  });
  it('accepts a host implementing the required secret APIs', () => {
    expect(() => assertHostCompatibility({ secretStorage: storage }, class SecretComponent {})).not.toThrow();
  });
  it.each([{}, { secretStorage: {} }, { secretStorage: { getSecret: () => null } }])('rejects a host missing secret storage before settings migration: %j', app => {
    expect(() => assertHostCompatibility(app, class SecretComponent {})).toThrow(/Obsidian 1\.11\.4.*Geode/);
  });
  it('rejects a host missing the secret settings component', () => {
    expect(() => assertHostCompatibility({ secretStorage: storage }, undefined)).toThrow(/secret-storage APIs/);
  });
});
