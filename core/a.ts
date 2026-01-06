// Estrategia A: Procesar mensajes en mayúsculas
import { MessageProcessor } from '../shared';

export class UpperCaseProcessor implements MessageProcessor {
  process(message: string): string {
    return `[UPPERCASE] ${message.toUpperCase()}`;
  }

  getName(): string {
    return 'UpperCase Strategy';
  }
}