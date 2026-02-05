// Estrategia B: Procesar mensajes al revés
import { MessageProcessor } from '../shared';
import { reverse, addTag } from '../common/utils';

export class ReverseProcessor implements MessageProcessor {
  process(message: string): string {
    return addTag('REVERSED', reverse(message));
  }

  getName(): string {
    return 'Reverse Strategy';
  }
}