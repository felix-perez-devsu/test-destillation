// Archivo principal que usa las estrategias
import { MessageContext } from './shared';
import { ReverseProcessor } from './core/b';

function main() {
  const message = "Hola mundo desde TypeScript";

  // Crear instancia de la estrategia B (ReverseProcessor)
  const reverseStrategy = new ReverseProcessor();

  // Usar la estrategia B
  const context = new MessageContext(reverseStrategy);
  console.log(context.executeStrategy(message));

  // Otro mensaje con la misma estrategia
  console.log(context.executeStrategy("Cambio de mensaje"));
}

main();
