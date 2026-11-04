import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type CsvRow = Record<string, string>;

function projectFile(name: string) {
  const projectRoot = existsSync(join(process.cwd(), "artifacts")) ? process.cwd() : join(process.cwd(), "..");
  return join(projectRoot, name);
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(projectFile(name), "utf8")) as T;
}

function readCsv(name: string): CsvRow[] {
  const [headerLine, ...lines] = readFileSync(projectFile(name), "utf8").trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])));
}

function number(row: CsvRow, key: string) {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${key} value in frozen research evaluation`);
  return value;
}

const productionBinary = readJson<{
  accuracy: number;
  balanced_accuracy: number;
  macro_f1: number;
  normal_recall: number;
  attack_recall: number;
  roc_auc: number;
}>("metrics/binary_xgboost_test_final_v1.json");
const productionMulticlass = readJson<{
  accuracy: number;
  balanced_accuracy: number;
  macro_f1: number;
  weighted_f1: number;
}>("metrics/multiclass_logistic_regression_test_final_v1.json");
const application = readJson<{
  frozen_models: {
    classical_binary: { file: string; threshold: number };
    classical_multiclass: { file: string };
    qml_binary: { file: string; threshold: number; parameter_count: number };
    qml_multiclass: { file: string; parameter_count: number };
  };
  qml_disclosure: { validated_device: string; reason: string };
}>("artifacts/farmflow_application_final_manifest_v1.json");
const phase16 = readJson<{
  artifact_integrity: { status: string; files: Record<string, unknown> };
  performance: {
    feature_extraction: { mean_ms: number };
    classical_binary: { mean_ms: number };
    classical_multiclass: { mean_ms: number };
    qml_binary: { mean_ms: number };
    qml_multiclass: { mean_ms: number };
    disclosure: string;
  };
  disagreement_observations: { classical_attack_qml_normal: string[]; classical_attack_qml_attack: string[] };
  attacks: Array<{ attack_type: string; agreement: boolean }>;
}>("artifacts/phase16_validation_results_v1.json");
const classMapping = readJson<{ mapping: Record<string, string>; excluded_raw_classes: string[] }>("artifacts/class_mapping_v1.json");
const multiclassExperiment = readJson<{
  test_rows: number;
  random_seed?: number;
  important_limitation: string;
}>("artifacts/multiclass_final_experiment_record_v1.json");
const multiclassSplit = readJson<{ random_seed: number }>("artifacts/multiclass_split_metadata_v1.json");
const binaryQmlExperiment = readJson<{ test_sampling: { method: string; random_state: number; total: number } }>("artifacts/binary_qml_final_experiment_record_v1.json");
const multiclassQmlExperiment = readJson<{ test_sampling: { method: string; random_state: number; total: number } }>("artifacts/multiclass_qml_final_experiment_record_v1.json");
const binarySplit = readJson<{
  random_seed: number;
  splits: { test: { rows: number } };
}>("artifacts/binary_split_metadata_v1.json");
const qmlRepresentation = readJson<{
  preprocessing_order: string[];
  state_dimension: number;
  qubits: number;
  padding_dimensions: number;
  quantum_encoding: string;
}>("artifacts/qml_amplitude_representation_v1.json");
const binaryMatchedRows = readCsv("metrics/final_binary_matched_ml_qml_v1.csv");
const multiclassMatchedRows = readCsv("metrics/final_multiclass_matched_ml_qml_v1.csv");

export const researchData = {
  production: {
    binary: {
      model: "XGBoost",
      artifact: application.frozen_models.classical_binary.file,
      threshold: application.frozen_models.classical_binary.threshold,
      metrics: [
        { label: "Test accuracy", value: productionBinary.accuracy, format: "percent" },
        { label: "Balanced accuracy", value: productionBinary.balanced_accuracy, format: "percent" },
        { label: "Macro F1", value: productionBinary.macro_f1, format: "percent" },
        { label: "Normal recall", value: productionBinary.normal_recall, format: "percent" },
        { label: "Attack recall", value: productionBinary.attack_recall, format: "percent" },
        { label: "ROC AUC", value: productionBinary.roc_auc, format: "auc" },
      ],
    },
    multiclass: {
      model: "Logistic Regression",
      artifact: application.frozen_models.classical_multiclass.file,
      predictionRule: "argmax",
      metrics: [
        { label: "Test accuracy", value: productionMulticlass.accuracy, format: "percent" },
        { label: "Balanced accuracy", value: productionMulticlass.balanced_accuracy, format: "percent" },
        { label: "Macro F1", value: productionMulticlass.macro_f1, format: "percent" },
        { label: "Weighted F1", value: productionMulticlass.weighted_f1, format: "percent" },
      ],
    },
    qmlBinary: {
      artifact: application.frozen_models.qml_binary.file,
      threshold: application.frozen_models.qml_binary.threshold,
      parameters: application.frozen_models.qml_binary.parameter_count,
    },
    qmlMulticlass: {
      artifact: application.frozen_models.qml_multiclass.file,
      parameters: application.frozen_models.qml_multiclass.parameter_count,
      predictionRule: "argmax",
    },
  },
  binaryMatched: binaryMatchedRows.map((row) => ({
    model: row.model,
    accuracy: number(row, "accuracy"),
    macroF1: number(row, "macro_f1"),
    trainSamples: number(row, "train_samples"),
    testSamples: number(row, "test_samples"),
    evaluation: row.evaluation,
  })),
  multiclassMatched: multiclassMatchedRows.map((row) => ({
    model: row.model,
    accuracy: number(row, "accuracy"),
    macroF1: number(row, "macro_f1"),
    trainSamples: number(row, "train_samples"),
    testSamples: number(row, "test_samples"),
    evaluation: row.evaluation,
  })),
  latency: [
    { label: "Feature extraction", value: phase16.performance.feature_extraction.mean_ms, kind: "classical" },
    { label: "Classical binary", value: phase16.performance.classical_binary.mean_ms, kind: "classical" },
    { label: "Classical multiclass", value: phase16.performance.classical_multiclass.mean_ms, kind: "classical" },
    { label: "QML binary", value: phase16.performance.qml_binary.mean_ms, kind: "qml" },
    { label: "QML multiclass", value: phase16.performance.qml_multiclass.mean_ms, kind: "qml" },
  ],
  latencyDisclosure: phase16.performance.disclosure,
  representation: {
    featureCount: 27,
    pipeline: qmlRepresentation.preprocessing_order,
    stateDimension: qmlRepresentation.state_dimension,
    paddingDimensions: qmlRepresentation.padding_dimensions,
    qubits: qmlRepresentation.qubits,
    encoding: qmlRepresentation.quantum_encoding,
    quantumLayers: 3,
    expectationOutputs: 5,
    binaryClassicalOutput: "nn.Linear(5, 1)",
    multiclassClassicalOutput: "nn.Linear(5, 8)",
  },
  experiment: {
    classes: Object.entries(classMapping.mapping).map(([id, label]) => ({ id, label })),
    excludedClasses: classMapping.excluded_raw_classes,
    binaryTestRows: binarySplit.splits.test.rows,
    multiclassTestRows: multiclassExperiment.test_rows,
    binaryRandomSeed: binarySplit.random_seed,
    multiclassRandomSeed: multiclassSplit.random_seed,
    binaryMatchedTestSampling: binaryQmlExperiment.test_sampling,
    multiclassMatchedTestSampling: multiclassQmlExperiment.test_sampling,
    multiclassLimitation: multiclassExperiment.important_limitation,
  },
  validation: {
    artifactIntegrityPassed: phase16.artifact_integrity.status === "passed",
    artifactCount: Object.keys(phase16.artifact_integrity.files).length,
    disagreementTypes: phase16.disagreement_observations.classical_attack_qml_normal.length,
    corroboratedAttackTypes: phase16.disagreement_observations.classical_attack_qml_attack,
    portScanningAgreement: phase16.attacks.find((attack) => attack.attack_type === "Port_Scanning")?.agreement === true,
  },
  qmlDevice: application.qml_disclosure.validated_device,
  qmlDeviceReason: application.qml_disclosure.reason,
} as const;

export function formatMetric(value: number, format: "percent" | "auc") {
  if (format === "auc") return `${value.toFixed(4)} (${value.toFixed(6)})`;
  return `${(value * 100).toFixed(2)}% (${value.toFixed(6)})`;
}

export function formatExact(value: number) {
  return value.toFixed(6);
}
