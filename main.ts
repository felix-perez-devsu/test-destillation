// Archivo principal que usa las estrategias
import { MessageContext } from './shared';
import { UpperCaseProcessor } from './core/a';
import { ReverseProcessor } from './core/b';

function main() {
  const message = "Hola mundo desde TypeScript";

  // Crear instancias de las estrategias
  const upperStrategy = new UpperCaseProcessor();
  const reverseStrategy = new ReverseProcessor();

  // Usar la estrategia A
  const context = new MessageContext(upperStrategy);
  console.log(context.executeStrategy(message));

  // Cambiar a la estrategia B
  context.setStrategy(reverseStrategy);
  console.log(context.executeStrategy(message));

  // Volver a la estrategia A
  context.setStrategy(upperStrategy);
  console.log(context.executeStrategy("Cambio de estrategia dinámico"));
}

main();