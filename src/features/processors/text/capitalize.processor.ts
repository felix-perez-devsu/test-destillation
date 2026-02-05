import { MessageProcessor } from '../../../../shared';

/**
 * Estrategia que capitaliza la primera letra de cada palabra
 */
export class CapitalizeProcessor implements MessageProcessor {
  process(message: string): string {
    const capitalized = message
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    return `[CAPITALIZED] ${capitalized}`;
  }

  getName(): string {
    return 'Capitalize Strategy';
  }
}
