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

/**
 * Plant got dearer as craft shops became factories: a coachbuilder's bench cost little, a mass-production
 * plant with presses, ovens and conveyors cost about two years of the profit it made. On top of prices.
 */
export const capexScale = (year: number) => interp([[1900, 1.5], [1906, 2], [1913, 5], [1920, 8], [1960, 8]], year);

/** Weeks to put up and equip a new line before it builds its first car. */
export const lineBuildWeeks = (year: number) => Math.round(interp([[1900, 3], [1913, 8], [1930, 12], [1960, 14]], year));

/**
 * Cost of a new empty production line: a workshop hall of three places a section. A hall is a
 * building, not a machine, so it pays only the square root of the plant premium; widening it into a
 * mass-production hall (`slotCost`) pays all of it.
 */
export const newLineCost = (year: number) => interp([[1900, 2500], [1913, 8000], [1930, 25000], [1950, 60000]], year) * costIndex(year) * Math.sqrt(capexScale(year));

/** Cost of adding one more station slot to every stage of a line. */
export const slotCost = (year: number, slots: number) => (400 + 250 * slots * slots) * costIndex(year) * (year >= 1913 ? 2 : 1) * capexScale(year);

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

/**
 * What a car costs in the showroom over its material and labour: the maker's margin and the dealer's
 * cut together (the class price is what buyers pay). A maker on modern lines keeps a thin margin at
 * the class price; one building by hand, or paying for dealers everywhere, has to earn it elsewhere.
 */
export const priceMarkup = (year: number) => interp([[1900, 1.42], [1908, 1.32], [1915, 1.22], [1930, 1.18], [1960, 1.18]], year);

/** Tooling (dies, jigs) cost as a multiple of the car's material cost. */
export const toolingMultiple = (year: number) => interp([[1900, 6], [1910, 12], [1920, 25], [1950, 40]], year);

/** One-time investment to make a component in-house. */
export const shopCost = (year: number) => interp([[1900, 4000], [1920, 20000], [1950, 60000]], year) * costIndex(year);

/**
 * Corporate income tax on profits, roughly as the home country charged it: the United States from
 * 1909 (1%) to 52% in the fifties; Britain and France a little earlier and higher.
 */
export function corporateTaxRate(year: number, hq: 'usa' | 'europe'): number {
  if (hq === 'usa')
    return year < 1909
      ? 0
      : interp([[1909, 0.01], [1916, 0.02], [1917, 0.06], [1918, 0.12], [1919, 0.1], [1922, 0.125], [1926, 0.135], [1929, 0.11], [1932, 0.1375], [1936, 0.15], [1938, 0.19], [1940, 0.24], [1942, 0.4], [1946, 0.38], [1950, 0.42], [1952, 0.52], [1960, 0.52]], year);
  return interp([[1900, 0.05], [1914, 0.06], [1916, 0.2], [1919, 0.25], [1925, 0.2], [1939, 0.3], [1941, 0.45], [1946, 0.45], [1960, 0.5]], year);
}

/** Bank credit limit and interest. */
export function creditTerms(year: number, reputation: number, assets: number) {
  const crisis = year >= 1930 && year < 1934;
  const limit = (15000 * costIndex(year) + 0.6 * Math.max(0, assets)) * (0.6 + reputation / 125) * (crisis ? 0.5 : 1);
  const rate = crisis ? 0.09 : 0.06;
  return { limit, rate };
}
