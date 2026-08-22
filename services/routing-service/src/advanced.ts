import {
  resolvePolicy,
  route,
  type AdvancedRoutingDecision,
  type PolicyVersion,
  type RouteCandidate,
  type RoutingMode,
  type RoutingRequest,
} from "@growx/routing";
export interface RoutingDataSource {
  policies(request: RoutingRequest): Promise<readonly PolicyVersion[]>;
  candidates(request: RoutingRequest): Promise<readonly RouteCandidate[]>;
  mode(): Promise<RoutingMode>;
}
export interface RoutingDecisionRepository {
  save(decision: AdvancedRoutingDecision): Promise<void>;
}
export class AdvancedRoutingService {
  constructor(
    private readonly source: RoutingDataSource,
    private readonly repository: RoutingDecisionRepository,
    private readonly createId: () => string,
  ) {}
  async decide(request: RoutingRequest): Promise<AdvancedRoutingDecision> {
    const [policies, candidates, mode] = await Promise.all([
      this.source.policies(request),
      this.source.candidates(request),
      this.source.mode(),
    ]);
    const decision = route(
      request,
      [...candidates],
      resolvePolicy([...policies]),
      mode,
      this.createId,
    );
    await this.repository.save(decision);
    return decision;
  }
}
