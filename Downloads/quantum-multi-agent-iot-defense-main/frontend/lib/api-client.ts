import type { DashboardSnapshot, DefenseAction, SimulationAction, Attack, RuntimeStatus } from "@/types/api";

export class ApiError extends Error {
  constructor(message: string, public status?: number) { super(message); this.name = "ApiError"; }
}

export class FarmFlowApi {
  constructor(private readonly baseUrl = "/api/backend", private readonly timeoutMs = 12000) {}

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init, signal: controller.signal,
        headers: { "Content-Type": "application/json", ...init?.headers },
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new ApiError(detail?.detail ?? `Request failed with status ${response.status}`, response.status);
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw new ApiError("Backend request timed out");
      throw new ApiError(error instanceof Error ? error.message : "Backend unavailable");
    } finally { clearTimeout(timeout); }
  }

  async snapshot(): Promise<DashboardSnapshot> {
    const raw = await this.request<Record<string, unknown>>("/v1/system/snapshot");
    return { health: raw.health, models: raw.models, simulation: raw.simulation,
      devices: raw.devices, topology: raw.topology, events: raw.events,
      featureStatus: raw.feature_status, flows: raw.flows, recentFeatures: raw.recent_features,
      agents: raw.agents, agentHealth: raw.agent_health, audit: raw.audit,
      attackTypes: raw.attack_types, attacks: raw.attacks, activeAttacks: raw.active_attacks,
      defenses: raw.defenses, policy: raw.policy, recoveries: raw.recoveries,
      epoch: raw.epoch, sequence: raw.sequence, runtimeStatus: raw.status } as DashboardSnapshot;
  }

  simulation(action: "start" | "pause" | "resume"): Promise<SimulationAction> { return this.request(`/v1/simulation/${action}`, { method: "POST" }); }
  reset(): Promise<SimulationAction> { return this.request("/v1/simulation/reset", { method: "POST", body: JSON.stringify({ seed: null }) }); }
  tick(count = 1): Promise<SimulationAction> { return this.request("/v1/simulation/tick", { method: "POST", body: JSON.stringify({ count }) }); }
  startAgents() { return this.request("/v1/agents/start", { method: "POST" }); }
  activateSystem(): Promise<RuntimeStatus> { return this.request("/v1/system/activate", { method: "POST" }); }
  deactivateSystem(): Promise<RuntimeStatus> { return this.request("/v1/system/deactivate", { method: "POST" }); }
  resetSystem(): Promise<RuntimeStatus> { return this.request("/v1/system/reset", { method: "POST" }); }
  scheduleAttack(body: { attack_type: string; target_device_id: string; intensity: string; duration_ticks: number; seed: number }): Promise<Attack> { return this.request("/v1/attacks/schedule", { method: "POST", body: JSON.stringify(body) }); }
  launchAttack(body: { attack_type: string; target_device_id: string; intensity: string; duration_ticks: number; seed: number }): Promise<Attack> { return this.request("/v1/attacks/launch", { method: "POST", body: JSON.stringify(body) }); }
  startAttack(id: string): Promise<Attack> { return this.request(`/v1/attacks/${id}/start`, { method: "POST" }); }
  cancelAttack(id: string): Promise<Attack> { return this.request(`/v1/attacks/${id}/cancel`, { method: "POST" }); }
  defense(id: string, action: "approve" | "reject" | "cancel" | "rollback"): Promise<DefenseAction> { return this.request(`/v1/defense/actions/${id}/${action}`, { method: "POST", body: JSON.stringify({ actor: "soc-operator", reason: `Operator ${action} from Phase 14 SOC console` }) }); }
}

export const api = new FarmFlowApi();
