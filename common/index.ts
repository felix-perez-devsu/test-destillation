// Interface compartida para las estrategias
export interface MessageProcessor {
  process(message: string): string;
  getName(): string;
}

// Context que usa las estrategias
export class MessageContext {
  private strategy: MessageProcessor;

  constructor(strategy: MessageProcessor) {
    this.strategy = strategy;
  }

  setStrategy(strategy: MessageProcessor): void {
    this.strategy = strategy;
  }

  executeStrategy(message: string): string {
    console.log(`Using strategy: ${this.strategy.getName()}`);
    return this.strategy.process(message);
  }
}