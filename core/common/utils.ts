// common/utils.ts

export function addTag(tag: string, message: string): string {
  return `[${tag}] ${message}`;
}

export function reverse(text: string): string {
  return text.split('').reverse().join('');
}

export function isEmpty(text: string): boolean {
  return text.trim().length === 0;
}
