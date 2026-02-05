// Estrategia C: Procesar mensajes en Title Case
import { MessageProcessor } from '../shared';

export class TitleCaseProcessor implements MessageProcessor {
  process(message: string): string {
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

