const { getDatabase } = require('./database.js');

function seedDatabase(customDb = null, options = {}) {
  const db = customDb || getDatabase();

  console.log('Iniciando seed da plataforma educacional...');

  // 1. Manutenção Segura e Preservação Estrita de Dados Acadêmicos (Append-Only)
  // NUNCA deletar tentativas, respostas, certificados, revisões espaçadas ou progresso do aluno!

  // 2. Inserir Disciplina (Subject)
  const insertSubject = db.prepare(`
    INSERT INTO subjects (id, title, description, prerequisites)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      prerequisites = excluded.prerequisites
  `);

  const subjectId = 'javascript-avancado';
  const prerequisites = JSON.stringify([
    'Conhecimento sólido em JavaScript moderno (ES6+)',
    'Experiência prática em desenvolvimento Front-end',
    'Familiaridade com consumo de APIs REST',
    'Compreensão básica de versionamento com Git'
  ]);

  insertSubject.run(
    subjectId,
    'JavaScript Avançado e Arquitetura de Sistemas',
    'Capacitar o aluno (desenvolvedor Front-end) a projetar e implementar sistemas complexos, dominar conceitos avançados de JavaScript, aplicar padrões de projeto e arquitetura de software, com foco em escalabilidade e performance.',
    prerequisites
  );

  // 3. Objetivos de Aprendizagem da Disciplina
  const insertObjective = db.prepare(`
    INSERT INTO learning_objectives (id, entity_type, entity_id, description)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      description = excluded.description
  `);

  const subjectObjectives = [
    'Analisar e aplicar padrões de projeto (Design Patterns) em JavaScript',
    'Desenhar arquiteturas de aplicações escaláveis (Micro-frontends, SSR, SSG)',
    'Otimizar a performance de aplicações web (Memory leaks, Event Loop, Web Workers)',
    'Gerenciar estados complexos em aplicações Front-end',
    'Implementar testes automatizados (unitários, integração, E2E) com confiança'
  ];

  subjectObjectives.forEach((desc, idx) => {
    insertObjective.run(`obj-subj-${idx + 1}`, 'SUBJECT', subjectId, desc);
  });

  // 4. Inserir 4 Módulos
  const insertModule = db.prepare(`
    INSERT INTO modules (id, subject_id, title, objective, order_index)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      objective = excluded.objective,
      order_index = excluded.order_index
  `);

  const modulesData = [
    {
      id: 'js-mod-1',
      title: 'Módulo 1: Fundamentos Avançados do JavaScript',
      objective: 'Dominar o funcionamento interno do JavaScript e suas peculiaridades (Engine V8, Event Loop, Closures, Protótipos e Assincronismo).',
      order: 1
    },
    {
      id: 'js-mod-2',
      title: 'Módulo 2: Padrões de Projeto (Design Patterns) em JavaScript',
      objective: 'Identificar e aplicar padrões de projeto clássicos (GoF) e modernos no ecossistema JavaScript e Front-end.',
      order: 2
    },
    {
      id: 'js-mod-3',
      title: 'Módulo 3: Arquitetura de Sistemas Front-end',
      objective: 'Projetar arquiteturas escaláveis, modulares e manuteníveis (SOLID, Clean Architecture, State Management, Micro-frontends).',
      order: 3
    },
    {
      id: 'js-mod-4',
      title: 'Módulo 4: Performance, Segurança e Qualidade',
      objective: 'Garantir a entrega de aplicações rápidas, seguras e testadas (Web Vitals, Web Workers, OWASP Front-end, Testes Automatizados).',
      order: 4
    }
  ];

  for (const m of modulesData) {
    insertModule.run(m.id, subjectId, m.title, m.objective, m.order);
  }

  // 5. Inserir Aulas Teóricas Ricas do Módulo 1
  const insertLesson = db.prepare(`
    INSERT INTO lessons (id, module_id, title, summary, content_markdown, lesson_type, estimated_minutes, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      summary = excluded.summary,
      content_markdown = excluded.content_markdown,
      lesson_type = excluded.lesson_type,
      estimated_minutes = excluded.estimated_minutes,
      order_index = excluded.order_index
  `);

  const lessonsData = [
    {
      id: 'js-mod-1-aula-1',
      moduleId: 'js-mod-1',
      title: 'Engine V8, Call Stack e Memory Heap',
      summary: 'Compreenda a arquitetura interna do motor V8 do Google, a compilação JIT (Ignition e TurboFan), a execução na Call Stack e o gerenciamento de memória com o Garbage Collector.',
      estimatedMinutes: 35,
      order: 1,
      contentMarkdown: `# Engine V8, Call Stack e Memory Heap

> [!NOTE]
> **Objetivo da Aula**: Compreender a anatomia interna do motor V8, identificar como a memória é alocada e coletada, e prevenir vazamentos de memória (memory leaks) em aplicações web complexas.

---

## 1. A Arquitetura do V8: Do Código-fonte ao Bytecode

O motor **V8**, desenvolvido pelo Google em C++, é a engine que executa JavaScript no Google Chrome, Chromium, Node.js, Deno e Electron. Ao contrário de linguagens puramente interpretadas ou previamente compiladas (AOT - Ahead-Of-Time), o V8 emprega compilação **JIT (Just-In-Time)**.

O pipeline de execução compreende as seguintes etapas principais:

1. **Parser & Lexer**: Converte o texto bruto do código JavaScript em tokens sintáticos e gera uma **AST (Abstract Syntax Tree)**.
2. **Ignition (Interpretador)**: Transforma a AST em um *bytecode* enxuto e eficiente, iniciando a execução de forma praticamente instantânea.
3. **TurboFan (Compilador Otimizador)**: Monitora a execução (*profiler*) procurando funções chamadas repetidamente (*hot functions*) com tipos de parâmetros consistentes. O TurboFan gera código de máquina nativo ultrarrápido através de hipóteses de tipos. Se uma hipótese for invalidada (ex: passar uma string para uma função que sempre recebia números), ocorre uma **deotimização (bailout)** e a execução retorna ao Ignition.

\`\`\`javascript
// Exemplo: Função candidata à otimização pelo TurboFan
function calcularTotal(preco, taxa) {
  // Se preco e taxa forem sempre números inteiros ou floats previsíveis,
  // o TurboFan compila para instruções em assembly otimizadas.
  return preco + (preco * taxa);
}

for (let i = 0; i < 10000; i++) {
  calcularTotal(100, 0.15); // Monomórfico (Altamente otimizável)
}
\`\`\`

---

## 2. Call Stack vs. Memory Heap

O ambiente de execução organiza a memória física em duas estruturas fundamentais:

| Estrutura | Responsabilidade | Mecanismo de Alocação |
|---|---|---|
| **Call Stack (Pilha)** | Execução sequencial de funções, variáveis primitivas locais e ponteiros. | LIFO (Last In, First Out). Alocação estática e rápida. |
| **Memory Heap (Monte)** | Armazenamento dinâmico de objetos, arrays, closures e estruturas de dados complexas. | Não-estruturada. Alocação dinâmica sob demanda. |

### Visualização do Fluxo na Call Stack

\`\`\`javascript
function calcularImposto(valor) {
  return valor * 0.1;
}

function processarPedido(item, valor) {
  const imposto = calcularImposto(valor);
  return valor + imposto;
}

processarPedido('Teclado', 250);
\`\`\`

Quando \`processarPedido\` é invocado:
1. \`main()\` ou contexto global é empilhado.
2. O frame de \`processarPedido\` é empilhado com seus parâmetros.
3. O frame de \`calcularImposto\` é empilhado sobre ele.
4. \`calcularImposto\` retorna o valor e é **desempilhado (popped)**.
5. \`processarPedido\` conclui o cálculo e é **desempilhado**.

> [!WARNING]
> **Stack Overflow**: Se uma função chamar a si mesma recursivamente sem condição de parada adequada, a Call Stack atinge o limite máximo de frames alocados pelo ambiente, disparando o erro \`RangeError: Maximum call stack size exceeded\`.

---

## 3. O Garbage Collector do V8

O JavaScript é uma linguagem com **gerenciamento automático de memória**. O V8 divide a Memory Heap em gerações:

* **New Space (Young Generation)**: Onde a grande maioria dos novos objetos nasce. Coletado com muita frequência através do algoritmo **Scavenger (Cheney's Copying Algorithm)**, rápido e de baixo impacto.
* **Old Space (Old Generation)**: Objetos que sobrevivem a ciclos de Scavenger são promovidos ao Old Space. Gerenciado pelo algoritmo **Major GC (Mark-Sweep-Compact)**.

### Algoritmo Mark-and-Sweep

1. **Mark (Marcação)**: O GC parte dos objetos raízes (*Roots*, como a janela global ou variáveis no escopo de execução ativo da Call Stack) e percorre todos os ponteiros referenciados. Objetos alcançáveis são marcados como *vivos*.
2. **Sweep (Varredura)**: A memória ocupada por qualquer objeto não marcado é liberada para novas alocações.
3. **Compact (Compactação)**: Realoca objetos sobreviventes para blocos contíguos de memória, eliminando a fragmentação da Heap.

---

## 4. Vazamentos de Memória Comuns (Memory Leaks)

Mesmo com Garbage Collection moderno, vazamentos ocorrem quando referências indesejadas a objetos impedem o GC de coletá-los:

1. **Variáveis Globais Acidentais**: Atribuições sem \`const\`/\`let\` vazam para o escopo global (\`window\` ou \`global\`).
2. **Event Listeners Esquecidos**: Adicionar \`addEventListener\` em elementos DOM que são removidos do documento sem chamar \`removeEventListener\`.
3. **Timers e Interrupções Não Canceladas**: \`setInterval\` ativo mantendo variáveis presas em sua closure.
4. **Closures com Referências Grandes**: Manter referências a estruturas pesadas em escopos externos que nunca são descartados.

\`\`\`javascript
// Anti-pattern: Vazamento com setInterval mantendo dados no Heap
function iniciarMonitoramento() {
  const dadosPesados = new Array(1000000).fill('📊 Dados de telemetria');

  // setInterval retém a closure mesmo se o componente sair de tela!
  setInterval(() => {
    console.log('Monitorando...', dadosPesados.length);
  }, 1000);
}
\`\`\`

---

## 💡 Recuperação Ativa (Autoavaliação)

Antes de seguir para a próxima aula, responda mentalmente:
1. Qual a diferença fundamental entre a Call Stack e a Memory Heap em termos de ciclo de vida dos dados?
2. Por que o TurboFan pode sofrer "deotimização" em tempo de execução?
3. Como o algoritmo Mark-and-Sweep determina se um objeto pode ou não ser coletado?`
    },
    {
      id: 'js-mod-1-aula-2',
      moduleId: 'js-mod-1',
      title: 'Event Loop, Microtasks e Macrotasks',
      summary: 'Desvende o modelo de concorrência e o ciclo de vida assíncrono do JavaScript: Call Stack, Web APIs, Microtask Queue, Macrotask Queue e prioridades do Event Loop.',
      estimatedMinutes: 40,
      order: 2,
      contentMarkdown: `# Event Loop, Microtasks e Macrotasks

> [!NOTE]
> **Objetivo da Aula**: Compreender o modelo de concorrência não bloqueante do JavaScript, dominar a ordem exata de drenagem das filas de tarefas e evitar congelamento de renderização ou starvation do Event Loop.

---

## 1. O Modelo Single-Thread do JavaScript

O motor JavaScript executa o código do usuário em uma única thread principal (**single-threaded**). Isso significa que existe **apenas uma Call Stack**: uma instrução é processada por vez.

Para lidar com operações I/O demoradas (como requisições HTTP, leitura de arquivos e timers) sem congelar a interface ou o servidor, o runtime delega tarefas ao ambiente hospedeiro:
* No navegador: **Web APIs** (DOM, Fetch, Timers).
* No Node.js: **libuv** (pool de threads em C++ para operações assíncronas do sistema operacional).

---

## 2. A Estrutura do Event Loop

O **Event Loop** é um laço contínuo que monitora a Call Stack e as filas de tarefas. Seu funcionamento segue regras de prioridade bem definidas:

\`\`\`text
   ┌──────────────────────────────────────────────┐
   │                  Call Stack                  │
   └──────────────────────┬───────────────────────┘
                          │ (Vazia?)
                          ▼
   ┌──────────────────────────────────────────────┐
   │             Microtask Queue                  │
   │  (Promise.then, queueMicrotask, MutationObs) │ ◄── Drenada COMPLETAMENTE
   └──────────────────────┬───────────────────────┘
                          │ (Esvaziou?)
                          ▼
   ┌──────────────────────────────────────────────┐
   │             Render Steps (Browser)           │
   │        (requestAnimationFrame, Paint)        │
   └──────────────────────┬───────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────┐
   │              Macrotask Queue                 │
   │       (setTimeout, setInterval, I/O)         │ ◄── Executa APENAS UMA por tick
   └──────────────────────────────────────────────┘
\`\`\`

### A Regra Fundamental das Filas:
1. O código síncrono é executado até esvaziar a **Call Stack**.
2. O Event Loop drena **TODAS as microtarefas** da **Microtask Queue**, inclusive novas microtarefas enfileiradas durante esse ciclo.
3. Se aplicável (no navegador), executam-se os passos de renderização visual.
4. O Event Loop retira e executa **exatamente UMA macrotarefa** da **Macrotask Queue**.
5. Retorna imediatamente para o passo 2 (verificando se a execução da macrotarefa enfileirou microtarefas).

---

## 3. Análise Prática de Execução

Analise a ordem do seguinte código:

\`\`\`javascript
console.log('1: Síncrono inicial');

setTimeout(() => {
  console.log('2: Macrotask (Timeout)');
}, 0);

Promise.resolve()
  .then(() => {
    console.log('3: Microtask 1');
    return 'extra';
  })
  .then(() => {
    console.log('4: Microtask 2');
  });

queueMicrotask(() => {
  console.log('5: Microtask explícita');
});

console.log('6: Síncrono final');
\`\`\`

### Rastreamento Passo a Passo:
1. \`console.log('1: Síncrono inicial')\` executa na Call Stack. -> Imprime **1: Síncrono inicial**.
2. \`setTimeout(..., 0)\` delega o timer para a Web API. O callback vai para a **Macrotask Queue**.
3. \`Promise.resolve().then(...)\` enfileira o callback na **Microtask Queue**.
4. \`queueMicrotask(...)\` enfileira o callback também na **Microtask Queue**.
5. \`console.log('6: Síncrono final')\` executa na Call Stack. -> Imprime **6: Síncrono final**.
6. A Call Stack esvaziou! O Event Loop examina a **Microtask Queue**:
   - Drena Microtask 1 -> Imprime **3: Microtask 1**. O retorno agenda Microtask 2.
   - Drena Microtask explícita -> Imprime **5: Microtask explícita**.
   - Drena Microtask 2 -> Imprime **4: Microtask 2**.
7. Microtask Queue completamente vazia! O Event Loop puxa uma macrotarefa:
   - Drena Macrotask -> Imprime **2: Macrotask (Timeout)**.

**Saída Final:** \`1, 6, 3, 5, 4, 2\`.

---

## 4. Starvation do Event Loop

> [!WARNING]
> **Cuidado com Microtasks Infinitas**: Como o Event Loop não avança para macrotarefas nem para a renderização antes de esvaziar **todas** as microtarefas, enfileirar recursivamente microtarefas bloqueia a aplicação completamente:

\`\`\`javascript
// PERIGO: Congela a UI e a navegação da página
function microtaskRecursiva() {
  Promise.resolve().then(microtaskRecursiva);
}
// microtaskRecursiva(); // Bloqueia o navegador indefinidamente!
\`\`\`

---

## 💡 Pratique

Experimente no seu console do navegador ou Node.js e observe se a ordem bate exatamente com o modelo teórico.`
    },
    {
      id: 'js-mod-1-aula-3',
      moduleId: 'js-mod-1',
      title: 'Closures, Scope e Hoisting',
      summary: 'Aprofunde-se no escopo léxico do JavaScript, entenda o funcionamento do Lexical Environment, a Temporal Dead Zone (TDZ) e o uso avançado de Closures para encapsulamento e privacidade de dados.',
      estimatedMinutes: 30,
      order: 3,
      contentMarkdown: `# Closures, Scope e Hoisting

> [!NOTE]
> **Objetivo da Aula**: Dominar a mecânica do escopo léxico, o comportamento de elevação de identificadores e o uso de closures como ferramentas de engenharia de software para encapsulamento, memoization e currying.

---

## 1. Escopo Léxico e Lexical Environment

No JavaScript, o escopo é **léxico (lexical scope)**: a visibilidade de uma variável é determinada pela **posição física** onde ela foi declarada no código-fonte, e não pelo local onde a função é chamada.

Internamente, cada contexto de execução possui um objeto de especificação chamado **Lexical Environment**, composto por:
1. **Environment Record**: O registro real onde identificadores (variáveis, constantes, funções) são mapeados para seus valores.
2. **Outer Reference (Referência Externa)**: Um ponteiro para o Lexical Environment do escopo pai circundante.

Quando uma variável é acessada, a engine procura no Environment Record local. Se não encontrar, segue a **cadeia de escopos (scope chain)** através do Outer Reference até o escopo global. Se ainda assim não encontrar, dispara \`ReferenceError\`.

---

## 2. Hoisting e a Temporal Dead Zone (TDZ)

**Hoisting** é o comportamento pelo qual a engine registra identificadores na fase de compilação/criação do contexto, antes da execução linha por linha:

* \`var\`: É içada e inicializada com o valor \`undefined\`. Tem escopo de função ou global.
* \`function declaration\`: É içada com sua definição completa, podendo ser invocada antes de sua declaração no arquivo.
* \`let\` e \`const\`: São içadas no escopo do bloco, mas **NÃO são inicializadas**. O período entre o início do bloco e a linha da declaração chama-se **Temporal Dead Zone (TDZ)**. Acessar a variável na TDZ gera imediatamente um \`ReferenceError\`.

\`\`\`javascript
console.log(minhaVar); // undefined (var foi içada)
var minhaVar = 'Disponível';

// console.log(minhaLet); // ReferenceError: Cannot access 'minhaLet' before initialization (TDZ)
let minhaLet = 'Inicializada agora';
\`\`\`

---

## 3. O que é uma Closure?

> Uma **Closure** é a combinação de uma função empacotada com as referências ao seu ambiente léxico circundante (as variáveis do escopo em que foi criada).

Em outras palavras: uma função JavaScript "lembra" do ambiente onde nasceu, mesmo quando é executada fora daquele escopo.

\`\`\`javascript
function criarContador(valorInicial = 0) {
  // Variável privada encapsulada no Lexical Environment de criarContador
  let contador = valorInicial;

  return {
    incrementar() {
      contador++;
      return contador;
    },
    decrementar() {
      contador--;
      return contador;
    },
    obterValor() {
      return contador;
    }
  };
}

const meuContador = criarContador(10);
console.log(meuContador.incrementar()); // 11
console.log(meuContador.incrementar()); // 12
console.log(meuContador.contador);    // undefined (privacidade garantida!)
\`\`\`

---

## 4. O Clássico Problema do Loop: \`var\` vs \`let\`

\`\`\`javascript
// Problema com 'var':
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log('var:', i), 50);
}
// Saída: var: 3, var: 3, var: 3

// Solução elegante com 'let':
for (let j = 0; j < 3; j++) {
  setTimeout(() => console.log('let:', j), 50);
}
// Saída: let: 0, let: 1, let: 2
\`\`\`

### Por que isso acontece?
* Com \`var\`, existe **uma única variável \`i\`** compartilhada no escopo da função ou global. Quando os timeouts disparam após 50ms, o loop já terminou e o valor de \`i\` é 3.
* Com \`let\`, a especificação ECMAScript cria um **novo Lexical Environment** a cada iteração do loop \`for\`. Cada callback fecha sobre a sua própria instância imutável de \`j\`.`
    },
    {
      id: 'js-mod-1-aula-4',
      moduleId: 'js-mod-1',
      title: 'Prototype Chain e Herança Prototípica',
      summary: 'Compreenda a herança baseada em protótipos do JavaScript, a cadeia de resolução [[Prototype]], a diferença entre prototype e __proto__, Object.create e as classes do ES6.',
      estimatedMinutes: 35,
      order: 4,
      contentMarkdown: `# Prototype Chain e Herança Prototípica

> [!NOTE]
> **Objetivo da Aula**: Desmistificar o modelo de herança prototípica do JavaScript, aprender a navegar e inspecionar a Prototype Chain, e entender como a sintaxe de classes do ES6 opera sob o capô.

---

## 1. O Modelo Prototípico

Diferente de linguagens como Java ou C++, onde classes funcionam como matrizes rígidas que instanciam objetos copiando estruturas, o JavaScript adota **herança por delegação prototípica**:

* Quase todo objeto em JavaScript possui um link interno para outro objeto, denominado seu **protótipo** (\`[[Prototype]]\`).
* Quando uma propriedade ou método é acessada em um objeto e não existe nele diretamente (*own property*), a engine sobe um nível e a busca em seu protótipo.
* O processo se repete até encontrar a propriedade ou alcançar \`null\` (o topo da cadeia, protótipo de \`Object.prototype\`). Se não encontrar, retorna \`undefined\`.

---

## 2. A Diferença Crucial: \`prototype\` vs \`[[Prototype]]\` (\`__proto__\`)

* \`[[Prototype]]\`: Propriedade interna oculta presente em qualquer objeto que aponta para o seu protótipo. Pode ser lida via \`Object.getPrototypeOf(obj)\` ou historicamente via \`obj.__proto__\`.
* \`funcaoConstrutora.prototype\`: Objeto que se tornará o \`[[Prototype]]\` de todas as instâncias criadas com \`new funcaoConstrutora()\`.

\`\`\`javascript
function Veiculo(marca) {
  this.marca = marca;
}

// Adicionando método ao protótipo (compartilhado por todas as instâncias)
Veiculo.prototype.buzinar = function() {
  return \`\${this.marca}: Beep beep!\`;
};

const carro = new Veiculo('Toyota');

console.log(carro.buzinar()); // "Toyota: Beep beep!"
console.log(Object.getPrototypeOf(carro) === Veiculo.prototype); // true
console.log(Object.getPrototypeOf(Veiculo.prototype) === Object.prototype); // true
console.log(Object.getPrototypeOf(Object.prototype)); // null (fim da cadeia)
\`\`\`

---

## 3. Criação de Objetos com \`Object.create()\`

A forma mais direta e pura de estabelecer herança prototípica sem invocar construtores é \`Object.create(proto)\`:

\`\`\`javascript
const servicoBase = {
  log(mensagem) {
    console.log(\`[\${this.modulo || 'SISTEMA'}]: \${mensagem}\`);
  }
};

const servicoPagamento = Object.create(servicoBase);
servicoPagamento.modulo = 'PAGAMENTOS';
servicoPagamento.log('Processando transação'); // [PAGAMENTOS]: Processando transação
\`\`\`

---

## 4. Classes do ES6: Açúcar Sintático Sobre Protótipos

As palavras-chave \`class\`, \`extends\` e \`super\` introduzidas no ES6 facilitam a leitura, mas **não alteram o funcionamento prototípico**:

\`\`\`javascript
class Entidade {
  constructor(id) {
    this.id = id;
  }

  identificar() {
    return \`ID: \${this.id}\`;
  }
}

class Usuario extends Entidade {
  constructor(id, nome) {
    super(id);
    this.nome = nome;
  }
}

const user = new Usuario('USR-100', 'Carlos');
console.log(typeof Usuario); // 'function' (classes continuam sendo funções construtoras!)
console.log(user instanceof Entidade); // true
console.log(Object.getPrototypeOf(Usuario.prototype) === Entidade.prototype); // true
\`\`\`

> [!WARNING]
> **Prototype Pollution**: Modificar diretamente \`Object.prototype\` afeta globalmente todos os objetos da aplicação. Essa prática pode introduzir vulnerabilidades críticas de segurança se dados não sanitizados de requisições puderem alterar chaves como \`__proto__\`.`
    },
    {
      id: 'js-mod-1-aula-5',
      moduleId: 'js-mod-1',
      title: 'Programação Assíncrona: Promises, Async/Await e Generators',
      summary: 'Domine a evolução do assincronismo em JavaScript: ciclo de vida de Promises, combinators (Promise.all, allSettled, race, any), padrões de async/await, tratamento de erros resiliente e controle de fluxo com Generators e Iterators.',
      estimatedMinutes: 45,
      order: 5,
      contentMarkdown: `# Programação Assíncrona: Promises, Async/Await e Generators

> [!NOTE]
> **Objetivo da Aula**: Dominar as construções assíncronas do JavaScript moderno, escolher o Promise combinator adequado para cada cenário de negócio, tratar falhas com resiliência e criar fluxos iteráveis sob demanda com Generators.

---

## 1. O Ciclo de Vida de uma Promise

Uma **Promise** é um objeto que representa a eventual conclusão (ou falha) de uma operação assíncrona. Ela pode estar em exatamente um de três estados:

* **Pending (Pendente)**: Estado inicial, nem cumprida, nem rejeitada.
* **Fulfilled (Realizada)**: A operação foi concluída com sucesso (\`resolve(valor)\`).
* **Rejected (Rejeitada)**: A operação falhou (\`reject(erro)\`).

Uma vez que a Promise transita para *Fulfilled* ou *Rejected*, ela se torna **Settled (Liquidada)** e seu estado e valor tornam-se imutáveis.

---

## 2. Promise Combinators: Estratégias Concorrentes

O ECMAScript disponibiliza 4 métodos estáticos para orquestrar múltiplas promessas simultaneamente:

| Método | Sucesso | Falha | Cenário Ideal |
|---|---|---|---|
| \`Promise.all\` | Quando **todas** cumprem. | Rejeita no **primeiro** erro (fail-fast). | Operações interdependentes (todas são obrigatórias). |
| \`Promise.allSettled\` | Quando **todas** liquidam (sucesso ou falha). | Nunca rejeita globalmente. | Lotes onde você precisa processar o status de cada item (ex: disparo em massa). |
| \`Promise.race\` | No **primeiro** que liquidar (sucesso ou falha). | Rejeita se o primeiro liquidado for rejeição. | Timeouts de rede e fallbacks ultra-rápidos. |
| \`Promise.any\` | No **primeiro sucesso**. | Rejeita apenas se **todas** falharem (\`AggregateError\`). | Requisições a múltiplos mirrors/CDNs (o primeiro que responder basta). |

\`\`\`javascript
// Exemplo: Resiliência em requisições de inventário
async function verificarDisponibilidade(produtos) {
  const promessas = produtos.map(p => checarEstoqueApi(p.id));
  const resultados = await Promise.allSettled(promessas);

  const disponiveis = [];
  const falhas = [];

  resultados.forEach((res, index) => {
    if (res.status === 'fulfilled') {
      disponiveis.push({ produto: produtos[index], estoque: res.value });
    } else {
      falhas.push({ produto: produtos[index], erro: res.reason.message });
    }
  });

  return { disponiveis, falhas };
}
\`\`\`

---

## 3. Async/Await Idiomático e Tratamento de Erros

A sintaxe \`async/await\` simplifica o consumo de Promises, transformando código assíncrono em uma estrutura de leitura sequencial:

\`\`\`javascript
async function carregarPerfilComFallback(usuarioId) {
  try {
    const usuario = await buscarUsuarioRemoto(usuarioId);
    return usuario;
  } catch (erroRemoto) {
    console.warn('Falha no serviço principal, consultando cache...', erroRemoto.message);
    try {
      return await buscarCacheLocal(usuarioId);
    } catch (erroCache) {
      throw new Error(\`Não foi possível carregar o usuário \${usuarioId}: falha geral.\`);
    }
  } finally {
    console.log('Operação de busca encerrada.');
  }
}
\`\`\`

---

## 4. Generators e o Protocolo de Iteração

**Generators** são funções especiais declaradas com \`function*\` que podem ser pausadas no meio de sua execução com o operador \`yield\` e retomadas sob demanda via \`.next()\`:

\`\`\`javascript
// Gerador de sequência com fluxo sob demanda (Lazy evaluation)
function* geradorDeIds() {
  let id = 1;
  while (true) {
    yield \`PEDIDO-\${id++}\`;
  }
}

const idStream = geradorDeIds();
console.log(idStream.next().value); // "PEDIDO-1"
console.log(idStream.next().value); // "PEDIDO-2"
console.log(idStream.next().value); // "PEDIDO-3"
\`\`\`

Generators implementam o protocolo **Iterable**, permitindo serem consumidos diretamente por laços \`for...of\`, pelo operador spread (\`[...]\`) e desestruturação.`
    }
  ];

  for (const l of lessonsData) {
    insertLesson.run(
      l.id,
      l.moduleId,
      l.title,
      l.summary,
      l.contentMarkdown,
      'THEORY',
      l.estimatedMinutes,
      l.order
    );
  }

  // 6. Materiais de Apoio (Support Materials)
  const insertMaterial = db.prepare(`
    INSERT INTO support_materials (id, target_type, target_id, title, url, resource_type)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      target_type = excluded.target_type,
      target_id = excluded.target_id,
      title = excluded.title,
      url = excluded.url,
      resource_type = excluded.resource_type
  `);

  const materials = [
    {
      id: 'mat-v8-dev',
      type: 'SUBJECT',
      targetId: subjectId,
      title: 'V8 Official Blog & Architecture Documentation',
      url: 'https://v8.dev/docs',
      resourceType: 'DOCUMENTATION'
    },
    {
      id: 'mat-mdn-event-loop',
      type: 'LESSON',
      targetId: 'js-mod-1-aula-2',
      title: 'MDN Web Docs: Concurrency model and the Event Loop',
      url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop',
      resourceType: 'DOCUMENTATION'
    },
    {
      id: 'mat-tc39-spec',
      type: 'SUBJECT',
      targetId: subjectId,
      title: 'ECMAScript Language Specification (ECMA-262)',
      url: 'https://tc39.es/ecma262/',
      resourceType: 'SPECIFICATION'
    },
    {
      id: 'mat-javascript-info',
      type: 'MODULE',
      targetId: 'js-mod-1',
      title: 'JavaScript.info: The Modern JavaScript Tutorial (Advanced)',
      url: 'https://javascript.info/',
      resourceType: 'ARTICLE'
    }
  ];

  for (const mat of materials) {
    insertMaterial.run(mat.id, mat.type, mat.targetId, mat.title, mat.url, mat.resourceType);
  }

  // 7. Avaliação Diagnóstica (JS-DIAG-01)
  const insertAssessment = db.prepare(`
    INSERT INTO assessments (id, subject_id, title, description, type, passing_score, max_score, time_limit_minutes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      type = excluded.type,
      passing_score = excluded.passing_score,
      max_score = excluded.max_score,
      time_limit_minutes = excluded.time_limit_minutes,
      status = excluded.status
  `);

  const diagAssessmentId = 'js-diag-01';
  insertAssessment.run(
    diagAssessmentId,
    subjectId,
    'Avaliação Diagnóstica - JavaScript Avançado & Arquitetura',
    'Avaliar o conhecimento real do aluno (conceitos dominados, conhecimentos parciais, lacunas e proficiência técnica) para personalizar o ritmo da disciplina.',
    'DIAGNOSTIC',
    70.0,
    100.0,
    60,
    'ACTIVE'
  );

  // 8. Inserir as 6 Questões da Avaliação Diagnóstica
  const insertQuestion = db.prepare(`
    INSERT INTO questions (id, assessment_id, type, prompt_markdown, options_json, correct_answer, rubric, explanation, points, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      prompt_markdown = excluded.prompt_markdown,
      options_json = excluded.options_json,
      correct_answer = excluded.correct_answer,
      rubric = excluded.rubric,
      explanation = excluded.explanation,
      points = excluded.points,
      order_index = excluded.order_index
  `);

  const questionsData = [
    {
      id: 'q1-closures-hoisting',
      assessmentId: diagAssessmentId,
      type: 'CODE_ANALYSIS',
      order: 1,
      points: 15.0,
      prompt: `Analise o código JavaScript abaixo e responda:

\`\`\`javascript
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log('A:', i), 100);
}

for (let j = 0; j < 3; j++) {
  setTimeout(() => console.log('B:', j), 100);
}
\`\`\`

**Perguntas:**
1. Qual será a saída exata impressa no console para o primeiro bloco (\`A\`) e para o segundo bloco (\`B\`)?
2. Explique detalhadamente por que ocorrem saídas diferentes, abordando os conceitos de **Escopo de Bloco vs Função**, **Lexical Environment** e **Closure**.`,
      options: null,
      correctAnswer: 'A: 3, 3, 3 e B: 0, 1, 2',
      rubric: 'Identifica que var possui escopo de função/global reaproveitando a mesma variável compartilhada na closure, enquanto let possui escopo de bloco criando uma nova ligação lexical (lexical binding) a cada iteração.',
      explanation: 'No bloco A com var, a variável i é içada para o escopo da função ou global. As 3 callbacks do setTimeout capturam uma referência à mesma variável compartilhada. Quando os timers disparam (após o loop terminar), i vale 3. Já no bloco B com let, cada iteração do loop for cria um novo Lexical Environment com uma instância independente de j capturada pela respectiva closure, imprimindo B: 0, B: 1 e B: 2.'
    },
    {
      id: 'q2-event-loop',
      assessmentId: diagAssessmentId,
      type: 'MULTIPLE_CHOICE',
      order: 2,
      points: 15.0,
      prompt: `Dado o seguinte trecho de código assíncrono:

\`\`\`javascript
console.log('1: Inicio');

setTimeout(() => {
  console.log('2: Timeout');
}, 0);

Promise.resolve().then(() => {
  console.log('3: Promise 1');
}).then(() => {
  console.log('4: Promise 2');
});

console.log('5: Fim');
\`\`\`

Qual é a ordem exata de saída no console e sua respectiva justificativa de prioridade no Event Loop?`,
      options: JSON.stringify([
        { id: 'A', text: '1, 2, 3, 4, 5 (setTimeout de 0ms executa antes de Promises)' },
        { id: 'B', text: '1, 5, 3, 4, 2 (Microtasks têm prioridade total sobre Macrotasks)' },
        { id: 'C', text: '1, 3, 5, 4, 2 (Promises executam de forma síncrona com o script)' },
        { id: 'D', text: '1, 5, 2, 3, 4 (Macrotasks são drenadas antes das Microtasks)' }
      ]),
      correctAnswer: 'B',
      rubric: 'Ordem correta: 1, 5, 3, 4, 2. Explica que Microtasks (Promises) têm prioridade absoluta sobre Macrotasks (setTimeout) na fila do Event Loop.',
      explanation: '1 e 5 são executados sincronamente na Call Stack inicial. O callback do setTimeout é enfileirado na Macrotask Queue. A Promise resolvida adiciona o callback da primeira microtarefa na Microtask Queue. Ao esvaziar a Call Stack síncrona, o Event Loop drena TODAS as microtarefas antes de puxar uma macrotarefa. Assim, executa 3 e em seguida 4 (que foi encadeada). Apenas após esvaziar a Microtask Queue é processada a Macrotask Queue, imprimindo 2.'
    },
    {
      id: 'q3-prototypes-this',
      assessmentId: diagAssessmentId,
      type: 'OPEN_QUESTION',
      order: 3,
      points: 15.0,
      prompt: `Considere o objeto abaixo:

\`\`\`javascript
const carrinho = {
  desconto: 0.10,
  produtos: [{ nome: 'Camiseta', preco: 100 }, { nome: 'Calça', preco: 200 }],
  
  calcularTotalTradicional: function() {
    return this.produtos.map(function(item) {
      return item.preco * (1 - this.desconto);
    });
  },
  
  calcularTotalArrow: function() {
    return this.produtos.map((item) => {
      return item.preco * (1 - this.desconto);
    });
  }
};
\`\`\`

**Perguntas:**
1. O que acontece ao executar \`carrinho.calcularTotalTradicional()\`? Por que ocorre erro ou resultado \`NaN\`?
2. O que acontece ao executar \`carrinho.calcularTotalArrow()\`? Explique como a **Arrow Function** trata o binding do \`this\` em relação a uma declaração tradicional \`function()\`.`,
      options: null,
      correctAnswer: 'Em calcularTotalTradicional ocorre NaN ou erro porque this dentro da função interna é undefined ou global. Em calcularTotalArrow funciona corretamente porque captura this léxico do carrinho.',
      rubric: 'Identifica que function tradicional recalcula this dinamicamente no contexto da invocação da callback (perdendo a referência a carrinho), enquanto a Arrow Function não possui seu próprio this e captura o this de forma léxica do escopo circundante.',
      explanation: 'Em calcularTotalTradicional(), a função callback passada para map() é invocada sem contexto de objeto. No modo estrito (strict mode) this é undefined, causando TypeError ao tentar acessar this.desconto (ou NaN em non-strict onde this é global e undefined resulta em 1 - undefined). Já em calcularTotalArrow(), a Arrow Function não cria seu próprio this binding; ela herda o this do método pai (que aponta para carrinho), calculando [90, 180] com sucesso.'
    },
    {
      id: 'q4-immutability-memory',
      assessmentId: diagAssessmentId,
      type: 'OPEN_QUESTION',
      order: 4,
      points: 15.0,
      prompt: `Um desenvolvedor escreveu a seguinte função para atualizar as preferências de um usuário no e-commerce:

\`\`\`javascript
const usuarioOriginal = {
  id: 101,
  nome: 'Ana',
  preferencias: { tema: 'escuro', notificacoes: true }
};

const usuarioAtualizado = Object.assign({}, usuarioOriginal);
usuarioAtualizado.preferencias.tema = 'claro';

console.log(usuarioOriginal.preferencias.tema); // Imprime 'claro'
\`\`\`

**Perguntas:**
1. Por que a alteração em \`usuarioAtualizado\` modificou o objeto \`usuarioOriginal\`?
2. Qual termo técnico descreve a cópia realizada por \`Object.assign\` e pelo operador spread (\`...\`)?
3. Como você resolveria esse problema nativamente no JavaScript moderno sem bibliotecas externas?`,
      options: null,
      correctAnswer: 'Shallow Copy copia apenas referências para objetos aninhados. Solução nativa: structuredClone(usuarioOriginal) ou espalhamento em profundidade.',
      rubric: 'Identifica Shallow Copy (cópia rasa). Propõe Deep Copy com structuredClone() nativo ou espalhamento em profundidade {...usuarioOriginal, preferencias: {...usuarioOriginal.preferencias, tema: "claro"}}.',
      explanation: 'Object.assign() e o spread operator realizam apenas uma cópia rasa (shallow copy): as propriedades de primeiro nível são copiadas por valor se primitivas, mas objetos aninhados (como preferencias) têm apenas seus ponteiros de referência de memória copiados. Portanto, ambos os objetos apontam para o mesmo objeto preferencias no Heap. Para resolver nativamente, utiliza-se a API moderna structuredClone(usuarioOriginal) ou spread imutável aninhado.'
    },
    {
      id: 'q5-esm-commonjs-treeshaking',
      assessmentId: diagAssessmentId,
      type: 'OPEN_QUESTION',
      order: 5,
      points: 20.0,
      prompt: `No ecossistema moderno de JavaScript e ferramentas de build (Webpack, Vite, Rollup):

**Perguntas:**
1. Qual é a diferença fundamental entre **CommonJS** (\`require\` / \`module.exports\`) e **ES Modules (ESM)** (\`import\` / \`export\`) no que diz respeito ao momento em que as dependências são resolvidas (compile-time vs runtime)?
2. O que é **Tree Shaking** e qual o requisito essencial nos módulos para que ele funcione adequadamente?`,
      options: null,
      correctAnswer: 'ESM é estático (resolvido em compile-time), permitindo análise estática de dependências e Tree Shaking. CommonJS é dinâmico (resolvido em runtime). Tree Shaking é a eliminação de código morto.',
      rubric: 'ESM é estático (análise em tempo de compilação/bundling), viabilizando eliminação de código morto (Tree Shaking). CommonJS é dinâmico (carregado em tempo de execução). Requisito do tree shaking: código modular baseado em ES Modules com imports/exports estáticos e ausência de efeitos colaterais impuros (sideEffects: false).',
      explanation: 'CommonJS resolve dependências dinamicamente em tempo de execução (runtime), permitindo require condicional dentro de if ou loops, o que impede a análise estática antecipada da árvore de dependências. ESM é estático (compile-time): imports e exports devem estar no nível superior do arquivo, permitindo ao bundler construir o grafo de dependências antes de rodar o código. Tree Shaking é a técnica de eliminação de código não utilizado (Dead Code Elimination); seu requisito fundamental é o uso de ESM puro e declaração correta de ausência de efeitos colaterais.'
    },
    {
      id: 'q6-design-patterns-observer',
      assessmentId: diagAssessmentId,
      type: 'OPEN_QUESTION',
      order: 6,
      points: 20.0,
      prompt: `Imagine que você precisa construir um componente de **Carrinho de Compras** em um e-commerce que precisa notificar automaticamente múltiplos módulos da aplicação (o contador do cabeçalho, a página de checkout e o sistema de analytics) sempre que um novo produto for adicionado.

**Perguntas:**
1. Qual **Padrão de Projeto (Design Pattern)** clássico é ideal para resolver esse problema de comunicação desacoplada?
2. Explique brevemente como esse padrão funciona e quais seriam os papéis envolvidos (ex: sujeito/observador ou emissor/ouvinte).`,
      options: null,
      correctAnswer: 'Padrão Observer ou Publish-Subscribe (Pub/Sub). O Subject (Carrinho) mantém lista de Observers (Header, Checkout, Analytics) e dispara notify() ao sofrer mutação.',
      rubric: 'Identifica o padrão Observer ou Publish-Subscribe (PubSub). Explica o desacoplamento entre o Subject/Publisher e os Observers/Subscribers, demonstrando como o sujeito notifica os observadores sem depender diretamente de suas implementações concretas.',
      explanation: 'O padrão ideal é o Observer (ou Pub/Sub). No Observer, o Carrinho atua como o Subject (sujeito observável), mantendo uma lista interna de Observers registrados (Header, Checkout, Analytics) via método subscribe()/attach(). Quando o estado do carrinho se altera (ex: itemAdded), o sujeito chama notify(), disparando o método update() em cada observador registrado. Isso garante baixo acoplamento: o carrinho não precisa saber detalhes de implementação de quem consome seus eventos.'
    }
  ];

  for (const q of questionsData) {
    insertQuestion.run(
      q.id,
      q.assessmentId,
      q.type,
      q.prompt,
      q.options,
      q.correctAnswer,
      q.rubric,
      q.explanation,
      q.points,
      q.order
    );
  }

  // 9. Registrar progresso inicial do aluno padrão (aluno-padrao)
  const insertProgress = db.prepare(`
    INSERT INTO user_progress (id, user_id, entity_type, entity_id, status, started_at, last_accessed_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id, entity_type, entity_id) DO NOTHING
  `);

  insertProgress.run('prog-init-1', 'aluno-padrao', 'LESSON', 'js-mod-1-aula-1', 'IN_PROGRESS');

  // 10. Inserir 6 Flashcards Essenciais de JavaScript (SRS - SM-2)
  const todayStr = new Date().toISOString().split('T')[0];
  const insertFlashcard = db.prepare(`
    INSERT INTO spaced_reviews (
      id, user_id, subject_id, topic_id, card_title, prompt_front, answer_back,
      repetition, interval_days, ease_factor, due_date, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);

  const flashcards = [
    {
      id: 'card-js-1-event-loop',
      userId: 'aluno-padrao',
      subjectId: 'javascript-avancado',
      topicId: 'event-loop',
      title: 'Event Loop & Ordem de Execução',
      front: 'Qual é a ordem de execução entre a Call Stack, a fila de Microtasks (Promises) e a fila de Macrotasks (setTimeout)?',
      back: '1. A **Call Stack** síncrona executa até esvaziar totalmente.\n2. Toda a fila de **Microtasks** (Promise callbacks, `queueMicrotask`) é drenada por completo antes de qualquer macrotask.\n3. O **Event Loop** retira e executa exatamente UMA **Macrotask** (`setTimeout`, I/O) da fila de tarefas e volta a verificar microtasks.'
    },
    {
      id: 'card-js-2-closures',
      userId: 'aluno-padrao',
      subjectId: 'javascript-avancado',
      topicId: 'closures',
      title: 'Closures & Gerenciamento de Memória',
      front: 'O que é uma Closure em JavaScript e onde suas variáveis capturadas residem na memória física da Engine V8?',
      back: 'Uma **Closure** é a combinação de uma função agrupada com referências ao seu escopo léxico circundante.\n\nEnquanto variáveis locais normais residem no Call Stack (pilha), as variáveis capturadas por closures são alocadas no **Heap**, permitindo que permaneçam vivas mesmo após a função externa ter concluído sua execução.'
    },
    {
      id: 'card-js-3-hoisting',
      userId: 'aluno-padrao',
      subjectId: 'javascript-avancado',
      topicId: 'hoisting-tdz',
      title: 'Hoisting & Temporal Dead Zone (TDZ)',
      front: 'Qual é a diferença fundamental no içamento (hoisting) de variáveis declaradas com `var` versus `let` e `const`?',
      back: '- `var`: É içada e inicializada imediatamente com `undefined` durante a fase de criação do escopo.\n- `let` e `const`: São içadas no escopo, mas **NÃO** são inicializadas. Elas permanecem na **Temporal Dead Zone (TDZ)** até que a linha da declaração seja executada. Tentar lê-las antes causa `ReferenceError`.'
    },
    {
      id: 'card-js-4-immutability',
      userId: 'aluno-padrao',
      subjectId: 'javascript-avancado',
      topicId: 'immutability-memory',
      title: 'Imutabilidade: Shallow Copy vs Deep Copy',
      front: 'Por que o operador spread (`{ ...obj }`) e `Object.assign` não previnem mutações indesejadas em objetos aninhados e qual API nativa moderna resolve isso?',
      back: 'Porque ambos realizam **Shallow Copy (cópia rasa)**: copiam os valores primitivos, mas apenas copiam referências de ponteiros de memória para objetos aninhados.\n\nA API moderna recomendada nativa do JavaScript é **`structuredClone(obj)`** (ou bibliotecas imutáveis), que clona árvores profundas com suporte nativo a Dates, Sets, Maps e referências circulares.'
    },
    {
      id: 'card-js-5-arrow-this',
      userId: 'aluno-padrao',
      subjectId: 'javascript-avancado',
      topicId: 'arrow-functions-this',
      title: 'Arrow Functions & `this` Léxico',
      front: 'Como o binding de `this` em uma Arrow Function difere de uma função tradicional e por que métodos como `.bind()`, `.call()` ou `.apply()` não alteram seu `this`?',
      back: 'Arrow functions **não possuem** seu próprio `this`, `arguments`, `super` ou `new.target`.\n\nO valor de `this` é capturado **lexicamente** do escopo pai no momento em que a função é criada no código. Como não há vínculo dinâmico em runtime, chamadas a `bind`, `call` ou `apply` não produzem nenhum efeito na resolução do `this`.'
    },
    {
      id: 'card-js-6-esm-treeshaking',
      userId: 'aluno-padrao',
      subjectId: 'javascript-avancado',
      topicId: 'esm-commonjs-treeshaking',
      title: 'ES Modules (ESM) vs CommonJS & Tree Shaking',
      front: 'Por que o Tree Shaking é eficaz em projetos que utilizam ES Modules (ESM), mas extremamente limitado em CommonJS?',
      back: '- **ESM (`import`/`export`)**: Possui estrutura puramente estática. O compilador/bundler pode construir o grafo de dependências completo em **tempo de compilação (compile-time)** sem rodar o código, eliminando com segurança exports não importados.\n- **CommonJS (`require`/`module.exports`)**: É dinâmico e resolvido em **runtime** (pode estar dentro de um `if` ou função), impossibilitando ao bundler garantir se determinado código será ou não invocado.'
    }
  ];

  for (const card of flashcards) {
    insertFlashcard.run(
      card.id,
      card.userId,
      card.subjectId,
      card.topicId,
      card.title,
      card.front,
      card.back,
      0, // repetition
      1, // interval_days
      2.5, // ease_factor
      todayStr, // due_date = hoje
      'REVIEW_REQUIRED'
    );
  }

  // 11. Inserir Exercícios de Fixação Imediata (Módulo 1)
  const path = require('node:path');
  const fs = require('node:fs');
  const exercisesJsonPath = path.resolve(__dirname, '..', 'materias', 'javascript', 'exercicios', 'modulo1_fixacao.json');
  let exercisesList = [];

  if (fs.existsSync(exercisesJsonPath)) {
    try {
      exercisesList = JSON.parse(fs.readFileSync(exercisesJsonPath, 'utf-8'));
    } catch (err) {
      console.error('Erro ao ler modulo1_fixacao.json no seed:', err);
    }
  }

  const insertExercise = db.prepare(`
    INSERT INTO lesson_exercises (
      id, lesson_id, type, title, prompt_markdown, options_json, correct_answer, explanation, initial_code, order_index
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      prompt_markdown = excluded.prompt_markdown,
      options_json = excluded.options_json,
      correct_answer = excluded.correct_answer,
      explanation = excluded.explanation,
      initial_code = excluded.initial_code,
      order_index = excluded.order_index
  `);

  for (const ex of exercisesList) {
    insertExercise.run(
      ex.id,
      ex.lesson_id,
      ex.type,
      ex.title,
      ex.prompt_markdown,
      ex.options ? JSON.stringify(ex.options) : null,
      ex.correct_answer || null,
      ex.explanation || null,
      ex.initial_code || null,
      ex.order_index
    );
  }

  // 12. Rotina de reidratação: lê professor/aluno/tentativas/*.json e garante integridade no SQLite
  const isTest = Boolean(customDb);
  const shouldRehydrate = options.rehydrate !== undefined ? options.rehydrate : !isTest;
  if (shouldRehydrate) {
    const { rehydrateAttempts } = require('./services/file-sync.js');
    rehydrateAttempts(db);
  }

  console.log('Seed concluído com sucesso!');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
