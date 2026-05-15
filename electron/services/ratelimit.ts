export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity
    this.lastRefill = Date.now()
  }

  private refill() {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond)
    this.lastRefill = now
  }

  async acquire(): Promise<void> {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }
    const waitMs = ((1 - this.tokens) / this.refillPerSecond) * 1000
    await new Promise((r) => setTimeout(r, waitMs))
    this.tokens = 0
    this.lastRefill = Date.now()
  }
}

export const yahooLimiter = new TokenBucket(4, 2)   // burst 4, 2 req/s
export const finnhubLimiter = new TokenBucket(5, 1)  // burst 5, 1 req/s
