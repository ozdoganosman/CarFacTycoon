import { interp } from './tech';

/** Price level relative to 1900 (inflation / deflation). */
export const costIndex = (year: number) =>
  interp(
    [
      [1900, 1], [1914, 1.05], [1918, 1.6], [1920, 1.8], [1922, 1.4], [1929, 1.35], [1933, 1.05],
      [1940, 1.15], [1945, 1.45], [1948, 1.75], [1950, 1.85], [1955, 2], [1960, 2.2],
    ],
    year,
  );

/** Real wage growth on top of inflation (productivity gains, the $5 day, unions). */
export const realWage = (year: number) => interp([[1900, 1], [1914, 1.3], [1930, 1.6], [1950, 2.2], [1960, 2.6]], year);

/** Share of the retail price kept by dealers. */
export const DEALER_COMMISSION = 0.12;

/** Weekly salary of one engineer. */
export const engineerSalary = (year: number) => 20 * costIndex(year) * (1 + 0.02 * Math.max(0, year - 1900));

/** Base overhead of running the company per week (office, workshop rent). */
export const overhead = (year: number, lines: number) => (40 + 30 * lines) * costIndex(year);

/** Cost of a new empty production line (building + conveyors). */
export const newLineCost = (year: number) => interp([[1900, 2500], [1913, 8000], [1930, 25000], [1950, 60000]], year) * costIndex(year);

/** Cost of adding one more station slot to every stage of a line. */
export const slotCost = (year: number, slots: number) => (400 + 250 * slots * slots) * costIndex(year) * (year >= 1913 ? 2 : 1);

export const MAX_SLOTS = 8;

/** Labour share of a typical car's cost (craft building → mass production). */
export const labourShare = (year: number) =>
  interp([[1900, 0.35], [1913, 0.32], [1920, 0.22], [1930, 0.18], [1960, 0.15]], year);

/** Typical industry margin on cost: early cars were rich men's toys, mass production squeezed margins. */
/**
 * The Great War put steel and everything made of it up by a quarter (1914-1918); car prices followed
 * for everyone, so they are part of the price level along with ordinary inflation.
 */
export const warPrice = (year: number) => (year >= 1914.6 && year < 1919 ? 1.18 : 1);
export const priceLevel = (year: number) => costIndex(year) * warPrice(year);

export const priceMarkup = (year: number) => interp([[1900, 1.42], [1908, 1.32], [1915, 1.22], [1930, 1.16], [1960, 1.15]], year);

/** Tooling (dies, jigs) cost as a multiple of the car's material cost. */
export const toolingMultiple = (year: number) => interp([[1900, 6], [1920, 10], [1950, 14]], year);

/** One-time investment to make a component in-house. */
export const shopCost = (year: number) => interp([[1900, 4000], [1920, 20000], [1950, 60000]], year) * costIndex(year);

/** Bank credit limit and interest. */
export function creditTerms(year: number, reputation: number, assets: number) {
  const crisis = year >= 1930 && year < 1934;
  const limit = (15000 * costIndex(year) + 0.6 * Math.max(0, assets)) * (0.6 + reputation / 125) * (crisis ? 0.5 : 1);
  const rate = crisis ? 0.09 : 0.06;
  return { limit, rate };
}
