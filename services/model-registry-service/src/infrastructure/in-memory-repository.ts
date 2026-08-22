import type {
  CanonicalModelEntity,
  ModelAliasEntity,
  ModelPricingEntity,
  ProviderRouteEntity,
} from "../domain/types.js";
import type {
  IModelRegistryRepository,
  ModelListFilter,
} from "../application/repository.js";

export class InMemoryModelRegistryRepository implements IModelRegistryRepository {
  private readonly models = new Map<string, CanonicalModelEntity>();
  private readonly routes = new Map<string, ProviderRouteEntity>();
  private readonly aliases = new Map<string, ModelAliasEntity>();
  private readonly pricing = new Map<string, ModelPricingEntity>();

  // -------------------------------------------------------------
  // Models
  // -------------------------------------------------------------

  async createModel(
    model: CanonicalModelEntity,
  ): Promise<CanonicalModelEntity> {
    this.models.set(model.id, { ...model });
    return { ...model };
  }

  async getModelById(id: string): Promise<CanonicalModelEntity | null> {
    const found = this.models.get(id);
    return found ? { ...found } : null;
  }

  async getModelByCanonicalId(
    canonicalId: string,
  ): Promise<CanonicalModelEntity | null> {
    for (const model of this.models.values()) {
      if (model.canonicalId.toLowerCase() === canonicalId.toLowerCase()) {
        return { ...model };
      }
    }
    return null;
  }

  async updateModel(
    id: string,
    updates: Partial<CanonicalModelEntity>,
  ): Promise<CanonicalModelEntity> {
    const existing = this.models.get(id);
    if (!existing) {
      throw new Error(`Model '${id}' not found`);
    }
    const updated: CanonicalModelEntity = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.models.set(id, updated);
    return { ...updated };
  }

  async listModels(
    filter: ModelListFilter = {},
  ): Promise<{ items: CanonicalModelEntity[]; hasMore: boolean }> {
    let items = Array.from(this.models.values());

    if (filter.customerVisible !== undefined) {
      items = items.filter((m) => m.customerVisible === filter.customerVisible);
    }
    if (filter.routingEligible !== undefined) {
      items = items.filter((m) => m.routingEligible === filter.routingEligible);
    }
    if (filter.status && filter.status.length > 0) {
      items = items.filter((m) => filter.status!.includes(m.status));
    }
    if (filter.family) {
      items = items.filter(
        (m) => m.family.toLowerCase() === filter.family!.toLowerCase(),
      );
    }
    if (filter.category) {
      items = items.filter(
        (m) => m.category.toLowerCase() === filter.category!.toLowerCase(),
      );
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      items = items.filter(
        (m) =>
          m.canonicalId.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q) ||
          m.family.toLowerCase().includes(q),
      );
    }

    // Stable ordering: family ASC, canonicalId ASC
    items.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

    const limit = filter.limit ?? 50;
    const paginated = items.slice(0, limit);
    const hasMore = items.length > limit;

    return { items: paginated.map((i) => ({ ...i })), hasMore };
  }

  async getAllModels(): Promise<CanonicalModelEntity[]> {
    return Array.from(this.models.values()).map((m) => ({ ...m }));
  }

  // -------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------

  async createRoute(route: ProviderRouteEntity): Promise<ProviderRouteEntity> {
    this.routes.set(route.id, { ...route });
    return { ...route };
  }

  async getRouteById(id: string): Promise<ProviderRouteEntity | null> {
    const found = this.routes.get(id);
    return found ? { ...found } : null;
  }

  async getRouteByProviderModel(
    providerId: string,
    providerModelId: string,
    region: string,
  ): Promise<ProviderRouteEntity | null> {
    for (const route of this.routes.values()) {
      if (
        route.providerId === providerId &&
        route.providerModelId === providerModelId &&
        route.region === region
      ) {
        return { ...route };
      }
    }
    return null;
  }

  async listRoutesByModelId(modelId: string): Promise<ProviderRouteEntity[]> {
    return Array.from(this.routes.values())
      .filter((r) => r.modelId === modelId || r.canonicalModelId === modelId)
      .map((r) => ({ ...r }));
  }

  async listAllRoutes(): Promise<ProviderRouteEntity[]> {
    return Array.from(this.routes.values()).map((r) => ({ ...r }));
  }

  async updateRoute(
    id: string,
    updates: Partial<ProviderRouteEntity>,
  ): Promise<ProviderRouteEntity> {
    const existing = this.routes.get(id);
    if (!existing) {
      throw new Error(`Route '${id}' not found`);
    }
    const updated: ProviderRouteEntity = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.routes.set(id, updated);
    return { ...updated };
  }

  // -------------------------------------------------------------
  // Aliases
  // -------------------------------------------------------------

  async createAlias(alias: ModelAliasEntity): Promise<ModelAliasEntity> {
    this.aliases.set(alias.id, { ...alias });
    return { ...alias };
  }

  async getAliasById(id: string): Promise<ModelAliasEntity | null> {
    const found = this.aliases.get(id);
    return found ? { ...found } : null;
  }

  async getAliasByName(alias: string): Promise<ModelAliasEntity | null> {
    for (const a of this.aliases.values()) {
      if (a.alias.toLowerCase() === alias.toLowerCase()) {
        return { ...a };
      }
    }
    return null;
  }

  async listAliases(): Promise<ModelAliasEntity[]> {
    return Array.from(this.aliases.values()).map((a) => ({ ...a }));
  }

  async updateAlias(
    id: string,
    updates: Partial<ModelAliasEntity>,
  ): Promise<ModelAliasEntity> {
    const existing = this.aliases.get(id);
    if (!existing) {
      throw new Error(`Alias '${id}' not found`);
    }
    const updated: ModelAliasEntity = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.aliases.set(id, updated);
    return { ...updated };
  }

  // -------------------------------------------------------------
  // Pricing
  // -------------------------------------------------------------

  async createPricing(
    pricing: ModelPricingEntity,
  ): Promise<ModelPricingEntity> {
    this.pricing.set(pricing.id, { ...pricing });
    return { ...pricing };
  }

  async getEffectivePricing(
    modelIdOrRouteId: string,
    timestamp = new Date(),
  ): Promise<ModelPricingEntity | null> {
    const matching = Array.from(this.pricing.values())
      .filter((p) => {
        const matchesTarget =
          p.modelId === modelIdOrRouteId || p.routeId === modelIdOrRouteId;
        if (!matchesTarget) return false;
        const afterStart = p.effectiveFrom <= timestamp;
        const beforeEnd = !p.effectiveTo || p.effectiveTo > timestamp;
        return afterStart && beforeEnd;
      })
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());

    return matching[0] ? { ...matching[0] } : null;
  }

  async listPricing(filter?: {
    modelId?: string;
    routeId?: string;
  }): Promise<ModelPricingEntity[]> {
    let items = Array.from(this.pricing.values());
    if (filter?.modelId) {
      items = items.filter((p) => p.modelId === filter.modelId);
    }
    if (filter?.routeId) {
      items = items.filter((p) => p.routeId === filter.routeId);
    }
    return items.map((p) => ({ ...p }));
  }
}
