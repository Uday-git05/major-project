import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SmartFarmView } from "@/components/smart-farm-view";
import { api } from "@/lib/api-client";
import { visualData } from "./visual-fixtures";

describe("Smart Farm scenario entry point", () => {
  it("uses the shared scheduler and launches a synthetic scenario against a selected farm sensor", async () => {
    const data = visualData();
    data.attackTypes = ["Arp_Spoofing", "HTTP_Flood", "ICMP_Flood", "MQTT_Flood", "Port_Scanning", "TCP_Flood", "UDP_Flood"].map((attack_type) => ({ attack_type, name: attack_type.replaceAll("_", " "), description: "Synthetic test", default_target_types: ["gateway", "soil_moisture_sensor", "temperature_sensor", "humidity_sensor", "water_flow_sensor", "pump_controller", "weather_node"], default_duration_ticks: 3, default_intensity: "medium", protocol: "TCP", service: "test", behavior_summary: "Simulator" }));
    const humidity = data.devices.find((device) => device.device_type === "humidity_sensor")!;
    const result = { ...data.attacks[0], attack_type: "HTTP_Flood", target_device_id: humidity.device_id, correlation_id: "returned-correlation" };
    const schedule = vi.spyOn(api, "scheduleAttack").mockResolvedValue(result);
    const complete = vi.fn();
    const commit = vi.fn();
    const beginScenarioFocus = vi.fn(() => commit);
    render(<SmartFarmView devices={data.devices} topology={data.topology} attacks={data.attacks} attackTypes={data.attackTypes} policy={data.policy} active={true} selectedDeviceId={humidity.device_id} focusedCorrelation={undefined} onSelectDevice={vi.fn()} onComplete={complete} beginScenarioFocus={beginScenarioFocus} />);

    fireEvent.click(screen.getByRole("button", { name: "Simulate Attack" }));
    const dialog = screen.getByRole("dialog", { name: "Simulate Attack" });
    expect(within(dialog).getByText(humidity.name, { selector: "p b" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /ARP Spoofing/ })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: /HTTP Flood/ }));
    expect(within(dialog).getByRole("combobox", { name: "Virtual target" })).toHaveValue(humidity.device_id);
    fireEvent.click(within(dialog).getByRole("button", { name: /Launch Scenario/ }));

    await waitFor(() => expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ attack_type: "HTTP_Flood", target_device_id: humidity.device_id })));
    expect(beginScenarioFocus).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(result);
    expect(complete).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
