# Test Destillation - Strategy Pattern

Proyecto simple en TypeScript que demuestra el uso del patrón **Strategy** para procesar mensajes de diferentes formas.

## 📁 Estructura del Proyecto

```
test-destillation/
├── core/
│   ├── a.ts          # Estrategia A: Convierte texto a mayúsculas
│   └── b.ts          # Estrategia B: Invierte el texto
├── shared/
│   └── index.ts      # Interface y Context del patrón Strategy
├── main.ts           # Archivo principal
├── package.json      # Configuración del proyecto
└── README.md         # Este archivo
```

## 🎯 ¿Qué hace?

El proyecto implementa dos estrategias de procesamiento de mensajes:

- **Strategy A (UpperCaseProcessor)**: Convierte el mensaje a mayúsculas
- **Strategy B (ReverseProcessor)**: Invierte el orden de los caracteres

El contexto permite cambiar dinámicamente entre estrategias en tiempo de ejecución.

## 🚀 Instalación y Uso

### 1. Instalar dependencias
```bash
npm install
```

### 2. Ejecutar en modo desarrollo
```bash
npm run dev
```

### 3. Compilar y ejecutar
```bash
npm run build
npm start
```

## 📝 Salida Esperada

```
Using strategy: UpperCase Strategy
[UPPERCASE] HOLA MUNDO DESDE TYPESCRIPT

Using strategy: Reverse Strategy
[REVERSED] tpircSepyT edsed odnum aloH

Using strategy: UpperCase Strategy
[UPPERCASE] CAMBIO DE ESTRATEGIA DINÁMICO
```

## 🏗️ Patrón Strategy

El patrón Strategy permite definir una familia de algoritmos, encapsular cada uno y hacerlos intercambiables. En este proyecto:

- **Interface (`MessageProcessor`)**: Define el contrato que deben seguir todas las estrategias
- **Estrategias Concretas (`a.ts`, `b.ts`)**: Implementan diferentes algoritmos de procesamiento
- **Context (`MessageContext`)**: Mantiene una referencia a una estrategia y delega el trabajo a ella

## 🔧 Extensión

Para agregar una nueva estrategia, simplemente:

1. Crea un nuevo archivo en `core/`
2. Implementa la interface `MessageProcessor`
3. Úsala en `main.ts`

Ejemplo:
```typescript
export class LowerCaseProcessor implements MessageProcessor {
  process(message: string): string {
    return `[lowercase] ${message.toLowerCase()}`;
  }

  getName(): string {
    return 'LowerCase Strategy';
  }
}
```