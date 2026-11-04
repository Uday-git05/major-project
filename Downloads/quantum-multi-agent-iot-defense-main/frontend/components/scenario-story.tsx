import type { DashboardSnapshot } from "@/types/api";
import type { ScenarioFocus } from "@/features/scenario-focus";
import { responseContext } from "@/features/response";
import { ResponseState } from "./response-state";

export function ScenarioStory({ data, focus, onViewIncident }: { data: DashboardSnapshot; focus: ScenarioFocus | null; onViewIncident: (value: string) => void }) {
  return <ResponseState context={responseContext(data, focus)} onViewIncident={onViewIncident} />;
}
