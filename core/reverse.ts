// Estrategia B: Procesar mensajes al revés
import { MessageProcessor } from '../common';

export class ReverseProcessor implements MessageProcessor {
  process(message: string): string {
    const reversed = message.split('').reverse().join('');
    return `[REVERSED] ${reversed}`;
  }

  getName(): string {
    return 'Reverse Strategy';
  }
}