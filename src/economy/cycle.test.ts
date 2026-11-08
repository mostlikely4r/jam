import { describe, expect, it } from "vitest";
import { runCycle, runToday, SCENARIOS, totalCash, USER_PRICES } from "./cycle";

describe("ore cycle calculator", () => {
  it.each(SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    "loses and creates no money or goods: %s",
    (_name, scenario) => {
      const result = runCycle(scenario);
      expect(totalCash(result)).toBeCloseTo(result.startCash, 3);
      const { holders } = result;
      const oreHeld = Object.values(holders).reduce((sum, holder) => sum + holder.ore, 0);
      const partsHeld = Object.values(holders).reduce((sum, holder) => sum + holder.parts, 0);
      expect(oreHeld + result.partsMade).toBeCloseTo(result.mined, 3);
      expect(partsHeld + result.services).toBeCloseTo(result.partsMade, 3);
    },
  );

  it("the margins along the chain add up to the end price", () => {
    const p = USER_PRICES;
    const earned =
      p.minerOre +
      (p.stationOre - p.minerOre) +
      (p.factoryOre - p.stationOre) +
      (p.factoryParts - p.factoryOre) +
      (p.shopParts - p.factoryParts) +
      (p.stationParts - p.shopParts) +
      (p.service - p.stationParts);
    expect(earned).toBe(p.service);
  });

  it("today's game only gains money through the hauler", () => {
    const result = runToday(10, 15);
    expect(result.miners + result.station - result.startCash).toBeCloseTo(result.creditsFromNowhere, 3);
    expect(40 + result.mined - result.services - result.oreToNowhere).toBeCloseTo(result.pile, 3);
  });
});
