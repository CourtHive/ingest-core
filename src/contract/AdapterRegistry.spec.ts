import { describe, expect, it } from 'vitest';

import type { FederationDataAdapter } from './FederationDataAdapter';
import { AdapterRegistry } from './AdapterRegistry';

const stubAdapter = (provider: string, prefix: string): FederationDataAdapter => ({
  provider,
  providerName: `${provider} stub`,
  organizationId: `00000000-0000-0000-0000-${provider.padStart(12, '0')}`,
  canHandle: (id) => id.startsWith(prefix),
  fetchTournament: async () => ({ error: 'NOT_IMPLEMENTED' }),
});

describe('AdapterRegistry', () => {
  it('routes identifiers to the first matching adapter', () => {
    const registry = new AdapterRegistry();
    registry.register(stubAdapter('CTS', 'https://cesky-tenis.cz/'));
    registry.register(stubAdapter('TE', 'https://tournaments.example-federation.test/'));

    expect(registry.resolve('https://cesky-tenis.cz/turnaj/1/sezona/2026')?.provider).toBe('CTS');
    expect(registry.resolve('https://tournaments.example-federation.test/t/123')?.provider).toBe('TE');
    expect(registry.resolve('https://example.com/unknown')).toBeUndefined();
  });

  it('rejects duplicate provider registration', () => {
    const registry = new AdapterRegistry();
    registry.register(stubAdapter('CTS', 'a'));
    expect(() => registry.register(stubAdapter('CTS', 'b'))).toThrow(/already registered/);
  });

  it('looks up by provider key', () => {
    const registry = new AdapterRegistry();
    registry.register(stubAdapter('DEMO', 'https://tournaments.other-example.test/'));
    expect(registry.byProvider('DEMO')?.providerName).toBe('DEMO stub');
    expect(registry.byProvider('MISSING')).toBeUndefined();
  });
});
