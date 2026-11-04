from app.domain.simulation import DeviceType, TopologyLink, TopologyNode, TopologyResponse

from .devices import VirtualDevice


def build_topology(devices: list[VirtualDevice]) -> TopologyResponse:
    gateway = next(device for device in devices if device.device_type is DeviceType.GATEWAY)
    nodes = [
        TopologyNode(
            device_id=device.device_id,
            device_type=device.device_type,
            name=device.name,
            address=device.address,
        )
        for device in devices
    ]
    links: list[TopologyLink] = []
    for device in devices:
        if device is gateway:
            continue
        links.append(
            TopologyLink(
                source_device_id=device.device_id,
                destination_device_id=gateway.device_id,
                relationship="telemetry",
            )
        )
        if device.device_type is DeviceType.PUMP_CONTROLLER:
            links.append(
                TopologyLink(
                    source_device_id=gateway.device_id,
                    destination_device_id=device.device_id,
                    relationship="control",
                )
            )
    return TopologyResponse(gateway_id=gateway.device_id, nodes=nodes, links=links)
