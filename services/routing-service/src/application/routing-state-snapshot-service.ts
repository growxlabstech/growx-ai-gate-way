import type {
  CanonicalModelEntity,
  ModelRegistryService,
  ProviderRouteEntity,
} from "@growx/model-registry-service";
import type { ProviderService } from "@growx/provider-service";
import type { RouteTrafficControl, RoutingPolicyV2 } from "@growx/contracts";
import type { IRouteHealthStore } from "@growx/routing";
import type {
  ICapacitySignalProvider,
  ILatencySignalProvider,
} from "../domain/signals.js";

export interface RoutingStateSnapshot {
  version: number;
  models: Map<string, CanonicalModelEntity>;
  routes: Map<string, ProviderRouteEntity[]>;
  providers: Map<string, any>;
  credentials: Map<string, any[]>;
  accounts: Map<string, any[]>;
  pools: Map<string, any[]>;
  trafficControls: Map<string, RouteTrafficControl>;
  activePolicies: Map<string, RoutingPolicyV2>;
  compiledAt: Date;
  expiresAt: Date;
}

export interface SnapshotServiceOptions {
  ttlMs?: number | undefined;
  routeHealthStore?: IRouteHealthStore | undefined;
  latencySignalProvider?: ILatencySignalProvider | undefined;
  capacitySignalProvider?: ICapacitySignalProvider | undefined;
}

export class RoutingStateSnapshotService {
  private currentSnapshot: RoutingStateSnapshot | null = null;
  private currentVersion = 1;
  private readonly ttlMs: number;
  private readonly healthStore?: IRouteHealthStore | undefined;
  private readonly latencyProvider?: ILatencySignalProvider | undefined;
  private readonly capacityProvider?: ICapacitySignalProvider | undefined;

  private inMemoryTrafficControls = new Map<string, RouteTrafficControl>();
  private inMemoryPolicies = new Map<string, RoutingPolicyV2>();

  constructor(
    private readonly modelRegistry: ModelRegistryService,
    private readonly providerService: ProviderService,
    options: SnapshotServiceOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 15_000;
    this.healthStore = options.routeHealthStore;
    this.latencyProvider = options.latencySignalProvider;
    this.capacityProvider = options.capacitySignalProvider;
  }

  public async getSnapshot(): Promise<RoutingStateSnapshot> {
    const now = new Date();
    if (this.currentSnapshot && this.currentSnapshot.expiresAt > now) {
      return this.currentSnapshot;
    }
    return this.refreshSnapshot();
  }

  public async refreshSnapshot(): Promise<RoutingStateSnapshot> {
    this.currentVersion++;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);

    const modelsMap = new Map<string, CanonicalModelEntity>();
    const routesMap = new Map<string, ProviderRouteEntity[]>();

    try {
      const repo = (this.modelRegistry as any).repository;
      const modelsList: CanonicalModelEntity[] = repo?.listModels
        ? (await repo.listModels({})).items
        : [];

      for (const m of modelsList) {
        modelsMap.set(m.canonicalId, m);
        modelsMap.set(m.id, m);
        const routes = repo?.listRoutes
          ? await repo.listRoutes(m.id).catch(() => [])
          : [];
        routesMap.set(m.canonicalId, routes);
        routesMap.set(m.id, routes);
      }
    } catch {
      // Graceful fallback
    }

    const providersList = await this.providerService
      .listProviders()
      .catch(() => []);
    const providersMap = new Map<string, any>();
    const credentialsMap = new Map<string, any[]>();
    const accountsMap = new Map<string, any[]>();
    const poolsMap = new Map<string, any[]>();

    for (const p of providersList) {
      providersMap.set(p.id, p);
      const creds = await this.providerService
        .listCredentials(p.id)
        .catch(() => []);
      credentialsMap.set(p.id, creds);
    }

    this.currentSnapshot = {
      version: this.currentVersion,
      models: modelsMap,
      routes: routesMap,
      providers: providersMap,
      credentials: credentialsMap,
      accounts: accountsMap,
      pools: poolsMap,
      trafficControls: new Map(this.inMemoryTrafficControls),
      activePolicies: new Map(this.inMemoryPolicies),
      compiledAt: now,
      expiresAt,
    };

    return this.currentSnapshot;
  }

  public invalidate(): void {
    this.currentSnapshot = null;
  }

  public invalidateRoutes(): void {
    this.invalidate();
  }

  public invalidateProviders(): void {
    this.invalidate();
  }

  public invalidatePricing(): void {
    this.invalidate();
  }

  public invalidatePolicies(): void {
    this.invalidate();
  }

  public invalidateHealth(): void {
    this.invalidate();
  }

  public invalidateCapacity(): void {
    this.invalidate();
  }

  public setTrafficControl(
    routeId: string,
    control: RouteTrafficControl,
  ): void {
    this.inMemoryTrafficControls.set(routeId, control);
    this.invalidate();
  }

  public getTrafficControl(routeId: string): RouteTrafficControl | undefined {
    return this.inMemoryTrafficControls.get(routeId);
  }

  public listTrafficControls(): RouteTrafficControl[] {
    return Array.from(this.inMemoryTrafficControls.values());
  }

  public setPolicy(policy: RoutingPolicyV2): void {
    this.inMemoryPolicies.set(policy.id, policy);
    this.invalidate();
  }

  public getPolicy(id: string): RoutingPolicyV2 | undefined {
    return this.inMemoryPolicies.get(id);
  }

  public listPolicies(): RoutingPolicyV2[] {
    return Array.from(this.inMemoryPolicies.values());
  }
}
