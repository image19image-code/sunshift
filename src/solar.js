// Estimated PV output model (assumptions, not measurements).
export const SYSTEM_EFFICIENCY = 0.85; // inverter, wiring, soiling losses
export const TEMP_COEFFICIENT = -0.004; // power change per °C above 25 °C
export const NOCT = 45; // nominal operating cell temperature (°C)

export function estimateOutputKw({ radiation, temperature }, panelKw) {
  if (
    typeof radiation !== 'number' ||
    typeof temperature !== 'number' ||
    radiation <= 0
  ) {
    return 0;
  }
  const cellTemp = temperature + ((NOCT - 20) / 800) * radiation;
  const tempFactor = Math.max(0, 1 + TEMP_COEFFICIENT * (cellTemp - 25));
  return panelKw * (radiation / 1000) * SYSTEM_EFFICIENCY * tempFactor;
}