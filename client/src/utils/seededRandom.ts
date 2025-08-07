// Seeded random number generator for consistent results across dashboard refreshes
export class SeededRandom {
  private seed: number;

  constructor(seed: number = 12345) {
    this.seed = seed;
  }

  random(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }

  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  randomFloat(min: number, max: number, decimals: number = 1): number {
    return Number((this.random() * (max - min) + min).toFixed(decimals));
  }

  // Generate array of items with consistent results
  randomArray<T>(items: T[], count: number): T[] {
    const shuffled = [...items].sort(() => this.random() - 0.5);
    return shuffled.slice(0, count);
  }

  // Generate random item from array
  randomItem<T>(items: T[]): T {
    return items[this.randomInt(0, items.length - 1)];
  }
}

// Default instances with fixed seeds for consistent results
export const dashboardRng = new SeededRandom(42);
export const chartRng = new SeededRandom(100);
export const trendRng = new SeededRandom(200);