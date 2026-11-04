import { scenarioData, scenarioAssessment, scenarioDefense, scenarioPrediction, scenarioRecovery } from "./scenario-fixtures";
export function noisyData() {
  const data = scenarioData();
  for (let i=0;i<80;i++) {
    const id = `background-${i}`;
    for (let revision=0;revision<3;revision++) data.events.push({...scenarioAssessment(id),event_id:`assessment-${id}-${revision}`,payload:{...scenarioAssessment(id).payload,severity:i<5?"high":"low"}});
    data.defenses.push(scenarioDefense(id,i<60?"planned":"completed"));
  }
  for (let i=0;i<1200;i++) data.events.push({event_id:`feature-${i}`,event_type:"feature_vector",correlation_id:`flow-${i%4}`,source:"feature-extractor",timestamp:"2026-01-01T00:00:07Z",payload:{flow_id:`flow-${i%4}`,feature_index:i}});
  for (let i=0;i<60;i++) data.events.push({...scenarioPrediction(),event_id:`repeat-${i}`});
  data.recoveries.push(...Array.from({length:30},(_,i)=>scenarioRecovery(`background-${i}`,i<10?"manual_review":"recovered",i>=10)));
  return data;
}
