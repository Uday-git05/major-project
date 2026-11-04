import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ResearchResultsPage from "@/app/research-results/page";

describe("frozen Model Performance dashboard", () => {
  it("shows the four selected runtime models with exact production and matched values", () => {
    render(<ResearchResultsPage />);
    expect(screen.getByRole("heading", { name: "Model Performance" })).toBeInTheDocument();
    const models = screen.getByRole("region", { name: "Selected Runtime Models" });
    for (const value of ["99.60% (0.995964)", "95.38% (0.953762)", "63.15% (0.631499)", "48.85% (0.488496)", "96.10% (0.961000)", "96.10% (0.960962)", "38.17% (0.381667)", "35.05% (0.350461)"]) {
      expect(within(models).getByText(value)).toBeInTheDocument();
    }
    expect(within(models).getByText("binary_xgboost_gpu_v1.json")).toBeInTheDocument();
    expect(within(models).getByText("Frozen threshold 0.012")).toBeInTheDocument();
  });

  it("identifies evaluated models and selected runtime mappings", () => {
    render(<ResearchResultsPage />);
    const models = screen.getByRole("region", { name: "Models Evaluated" });
    for (const name of ["Logistic Regression", "Random Forest", "Classical MLP", "XGBoost · production binary", "5-Qubit Amplitude QML", "Selected for Runtime"]) {
      expect(within(models).getAllByText(name).length).toBeGreaterThan(0);
    }
    for (const runtime of ["Binary", "Multiclass", "Binary QML", "Multiclass QML"]) expect(within(models).getByText(runtime)).toBeInTheDocument();
  });

  it("plots frozen binary and multiclass Macro F1 results with the stated interpretation", () => {
    render(<ResearchResultsPage />);
    const binary = screen.getByRole("region", { name: "Binary Detection — Model Comparison" });
    const multiclass = screen.getByRole("region", { name: "Attack Attribution — Model Comparison" });
    for (const score of ["0.881376", "0.993000", "0.933711", "0.960962"]) expect(within(binary).getByText(score)).toBeInTheDocument();
    for (const score of ["0.456950", "0.317297", "0.337400", "0.350461"]) expect(within(multiclass).getByText(score)).toBeInTheDocument();
    expect(within(binary).getByText(/QML outperformed Logistic Regression and the Classical MLP/)).toBeInTheDocument();
    expect(within(multiclass).getByText(/Logistic Regression achieved the best Macro F1/)).toBeInTheDocument();
    expect(screen.getByText(/No quantum advantage is claimed/)).toBeInTheDocument();
  });

  it("shows the notebook's QML validation/test Macro F1 and readable architecture", () => {
    render(<ResearchResultsPage />);
    const generalization = screen.getByRole("region", { name: "QML Validation vs Test Performance" });
    for (const score of ["0.959969", "0.960962", "0.550067", "0.350461"]) expect(within(generalization).getByText(score)).toBeInTheDocument();
    const architecture = screen.getByRole("region", { name: "QML Architecture" });
    for (const step of ["27 ordered network features", "TRAIN-fitted StandardScaler", "L2 normalization", "Append 5 zeros · 27 → 32", "32 amplitude values", "5 qubits", "AmplitudeEmbedding", "3 StronglyEntanglingLayers", "5 Pauli-Z expectation values"]) {
      expect(within(architecture).getByText(step)).toBeInTheDocument();
    }
    expect(within(architecture).getByText("nn.Linear(5, 1) · 51 trainable parameters · threshold 0.390")).toBeInTheDocument();
    expect(within(architecture).getByText("nn.Linear(5, 8) · 93 trainable parameters · argmax")).toBeInTheDocument();
  });

  it("keeps limitations and artifact integrity out of the default visual flow", () => {
    render(<ResearchResultsPage />);
    const researchNotes = screen.getByText("Research Notes").closest("details");
    expect(researchNotes).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Research Notes"));
    expect(screen.getByRole("region", { name: "Known Limitations" })).toBeInTheDocument();
    const notes = screen.getByText("Reproducibility and artifact integrity");
    expect(notes.closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText(/Latest ML \+ QML Decision|Current Detection State|Simulation tick [0-9]/i)).not.toBeInTheDocument();
  });
});
