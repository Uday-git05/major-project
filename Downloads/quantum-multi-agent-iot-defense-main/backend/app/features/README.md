# Synthetic Farm-Flow Compatibility Feature Extractor v1

The live extractor is a deterministic compatibility layer for the project's virtual IoT
testbed. It uses the same 27-feature contract expected by the frozen models, but it is not
claimed to exactly reproduce the original dataset author's packet-to-flow implementation.

No scaling occurs here. Phase 8 remains the sole owner of classical and QML preprocessing.

## Flow identity

A directional flow key is `(initiator address, responder address, initiator port,
responder port, protocol)`. The first request direction establishes the initiator.
`device_response` events reverse their endpoints during canonicalization so that responses
join the initiator's existing flow. The UUID flow ID is a deterministic UUIDv5 of this key.

## Formulas and units

Packet timestamps and all IAT values use seconds. Flow duration is the final packet timestamp
minus the first packet timestamp after timestamp sorting.

- `missed_bytes`: sum of explicit packet `missed_bytes`.
- `orig_pkts`, `resp_pkts`: forward and backward packet counts.
- `orig_ip_bytes`, `resp_ip_bytes`: directional sums of total packet bytes.
- Directional packet rates: directional count divided by flow duration.
- Flow packet rate: total count divided by flow duration.
- `down_up_ratio`: backward count divided by forward count.
- Header totals/min/max: directional sum/min/max of per-packet header bytes.
- Payload totals: directional or combined sums of per-packet payload bytes.
- Payload averages: payload total divided by the corresponding packet count.
- Directional IAT totals/averages: sum/mean of intervals between timestamp-sorted packets
  in that direction.
- Flow IAT total/average: sum/mean of intervals between every timestamp-sorted packet.

Every denominator of zero produces `0.0`. Missing directions have zero totals, minima,
maxima, and averages. One-packet and same-timestamp flows therefore have zero IATs and
zero packet rates when their duration is zero.

## Window and validation policy

The first eligible flow state emits immediately after the configured minimum packet count.
Updated partial vectors emit no more frequently than the simulation-time emission interval.
Inactivity timeout or maximum age emits a final non-partial vector and removes the flow.

Events are deduplicated by event UUID. Out-of-order events are accepted, counted, and
timestamp-sorted. Provenance UUIDs and recent feature vectors are bounded. Missing packet
samples, naive timestamps, aggregate/sample inconsistencies, non-finite numbers, negative
times, and negative byte counts are rejected or counted as invalid; no NaN or infinity is
published.
