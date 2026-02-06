// Estrategia C: Procesar mensajes en Title Case
import { MessageProcessor } from '../common';
import { validateMessage } from '../common/message.validator';

export class TitleCaseProcessor implements MessageProcessor {
  process(message: string): string {
    validateMessage(message);

    const title = message
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return `[TITLE] ${title}`;
  }

  getName(): string {
    return 'Title Case Strategy';
  }
}