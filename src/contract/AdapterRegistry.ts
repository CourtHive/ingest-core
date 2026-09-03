import type { FederationDataAdapter } from './FederationDataAdapter';

export class AdapterRegistry {
  private readonly adapters: FederationDataAdapter[] = [];

  register(adapter: FederationDataAdapter): this {
    if (this.adapters.some((a) => a.provider === adapter.provider)) {
      throw new Error(`Adapter already registered for provider: ${adapter.provider}`);
    }
    this.adapters.push(adapter);
    return this;
  }

  resolve(identifier: string): FederationDataAdapter | undefined {
    return this.adapters.find((a) => a.canHandle(identifier));
  }

  byProvider(provider: string): FederationDataAdapter | undefined {
    return this.adapters.find((a) => a.provider === provider);
  }

  list(): readonly FederationDataAdapter[] {
    return this.adapters;
  }
}
