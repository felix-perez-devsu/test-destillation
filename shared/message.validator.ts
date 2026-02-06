// validators/message.validator.ts

export function validateMessage(message: string): void {
  if (!message || message.trim().length === 0) {
    throw new Error('Message cannot be empty');
  }

  if (message.length > 500) {
    throw new Error('Message too long');
  }
}
