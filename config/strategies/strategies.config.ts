/**
 * Configuración de estrategias disponibles
 * 
 * Este archivo define las estrategias de procesamiento de mensajes
 * que están habilitadas en el sistema.
 */

export interface StrategyConfig {
  name: string;
  enabled: boolean;
  description: string;
}

export const AVAILABLE_STRATEGIES: StrategyConfig[] = [
  {
    name: 'uppercase',
    enabled: true,
    description: 'Convierte el mensaje a mayúsculas'
  },
  {
    name: 'reverse',
    enabled: true,
    description: 'Invierte el orden de los caracteres del mensaje'
  }
];

export const DEFAULT_STRATEGY = 'uppercase';
