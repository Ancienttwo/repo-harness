# repo-harness

Repo-local agentic development harness CLI y skill runtime para workflows de
Claude/Codex.

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

Dirección del repositorio: `https://github.com/Ancienttwo/repo-harness`

`repo-harness` es un harness de workflow que aterriza el proceso de programación
con IA en archivos del repositorio. Es a la vez el repositorio fuente de la CLI
`repo-harness` y de su skill runtime, y el ejemplo autoalojado del workflow
repo-local que él mismo genera para los proyectos downstream.

## Por qué usar repo-harness

- **El estado de la sesión vive en archivos, no en el historial de chat.** Las
  distintas sesiones de agente —Claude, Codex, ahora o más tarde— se mantienen
  sincronizadas a través del repositorio en lugar de un hilo de chat. Cuando
  arranca una sesión nueva, `.ai/hooks/session-start-context.sh` inyecta el
  resume packet de la sesión anterior (`.ai/harness/handoff/resume.md`,
  `tasks/current.md`); al terminar la sesión y tras cada edición,
  `finalize-handoff.sh` y `post-edit-guard.sh` escriben de vuelta el siguiente
  handoff. Una tarea puede cortarse a mitad de camino y la siguiente sesión
  retoma directamente el next step exacto, los puntos de bloqueo y los archivos
  modificados sin tener que volver a inferirlos.
- **Ahorra tokens por diseño.** En lugar de los bucles grep+read que reescanean
  el repositorio en cada sesión, el harness usa el índice pre-construido de
  CodeGraph para hacer consultas estructurales (quién llama, a qué llama, dónde
  está definido) y, además, carga de contexto progresiva mediante
  `.ai/context/context-map.json` y `capabilities.json`: un root context pequeño y
  estable (~12KB), más bloques de capability que solo se cargan cuando los
  archivos que tocas los necesitan. Un agente lee un contract de capability de
  1KB o consulta el índice, en vez de gastar miles de tokens redescubriendo la
  estructura.

## Novedades en 0.2.1

- **Comando de inicialización global (`repo-harness init`).** Un solo comando
  inicializa el entorno global de Claude: essential plugins, policy
  hooks configurables (worktree guard, atomic commit/pending), LSP plugins
  opcionales según el tipo de proyecto y cuatro hook profiles (`standard`,
  `minimal`, `biome`, `biome-strict`). Ejecuta
  `npx -y repo-harness init`; no necesitas clonar el repositorio fuente.
- **Comando de refresco del repo (`repo-harness update`).** La instalación y el
  refresco de repos existentes tienen su propia superficie de comando, manteniendo
  la ruta de migración repo-local anterior mientras `init` queda dedicado al
  runtime global.
- **Auto-recuperación del índice CodeGraph.** Si el prompt hook detecta intención
  de navegación estructural y el repo no tiene índice `.codegraph`, inicializa el
  índice con el binario CodeGraph local o visible en PATH antes de emitir la pista.
  Sigue siendo advisory: no instala dependencias, no ejecuta el readiness probe
  pesado y no bloquea el prompt si CodeGraph no está disponible.
- **Centinela de seguridad (`repo-harness security scan` + `security-sentinel.sh`).**
  Una verificación de solo lectura sobre las superficies de inyección de
  configuración de alto valor (`~/.claude/settings.json`, `~/.codex/hooks.json`,
  el `.vscode/tasks.json` repo-local y los adapters legacy a nivel de proyecto
  `.claude`/`.codex`). Marca patrones de comando sospechosos —pipes de remote
  shell, base64-decode-to-exec, `osascript`, persistencia con
  `launchctl`/`crontab`, netcat, ejecución inline de intérpretes—, además de
  hooks no gestionados y tareas `folderOpen` de ejecución automática, y nunca
  modifica ninguna configuración. El centinela de `SessionStart` toma una huella
  de este conjunto y solo reescanea cuando la huella cambia, para no generar
  ruido en el session-start. Auditoría bajo demanda:
  `repo-harness security scan --json`.
- **Ciclo de vida draft-plan de Claude/Codex.** El Plan mode tiene explícitamente
  dos etapas: Draft y Approved. Los hooks reconocen la intención de crear un plan
  y rastrean la pending orchestration; un stop gate (`stop-orchestrator.sh`) exige
  que la sesión haga una pasada de autorevisión antes de terminar con el plan sin
  definir. Captura un borrador con `scripts/capture-plan.sh --slug <slug> --title
  <title> --status Draft`, después promociónalo a Approved y proyéctalo a
  ejecución con `--execute` o `scripts/plan-to-todo.sh --plan <plan>`. Los plans
  se convierten en la fuente de verdad a nivel de archivo en `plans/`.

## Qué hace el producto

`repo-harness` convierte el desarrollo asistido por IA de una "coordinación verbal
en el historial de chat" en un "estado de workflow auditable en el repositorio".
Instala en el repositorio objetivo un conjunto de contracts de archivos pequeño y
explícito, para que Claude, Codex y las personas tengan una misma fuente de verdad
sobre estas cuestiones:

- cuál es la intención de producto estable
- qué plan ya está aprobado para entrar en ejecución
- qué scope permite modificar el sprint contract actual
- qué checks, review y evidence prueban que la tarea está realmente completa
- cómo deben los hooks advertir, bloquear, registrar trace y hacer handoff entre
  sesiones

No es un agent gateway, ni un runtime de producto, ni un servicio de base de
datos, ni un MCP server. El límite del producto es claro: inspecciona el
repositorio objetivo, instala o refresca los archivos de workflow, enruta los host
events de Claude/Codex hacia los hooks repo-local, y luego verifica que esas
workflow surfaces sigan siendo coherentes.

## Cómo funciona

En conjunto hay tres capas:

1. **Capa del paquete fuente**: este repositorio mantiene la CLI, los command
   skill facades, los templates, los hook assets, el workflow contract, los tests
   y el release gate.
2. **Capa del contract del repositorio objetivo**: `repo-harness update` o la
   migración escribe `docs/spec.md`, `plans/`, `tasks/`, `.ai/context/`,
   `.ai/harness/`, helper scripts y `.ai/hooks/`.
3. **Capa del host adapter**: el `~/.claude/settings.json` y el
   `~/.codex/hooks.json` a nivel de usuario enrutan los events de Claude/Codex
   hacia `repo-harness-hook`. El hook entrypoint primero comprueba si el repo
   actual tiene un `.ai/harness/workflow-contract.json`; si no hay opt in, sale en
   silencio, y solo si hay opt in entra en los `.ai/hooks/*` del repo actual.

Para `UserPromptSubmit`, el adapter contract público sigue siendo
`repo-harness-hook UserPromptSubmit --route default`. El CLI route registry hace
dispatch de esa route a `.ai/hooks/prompt-guard.sh`. El shell hook se sigue
ocupando del parseo del host JSON, la lectura de los archivos de workflow, los
side effects de plan capture, el render del quality gate y el stdout/stderr
host-safe. La decisión sobre el prompt intent y el workflow state se delega al
TypeScript decision engine detrás de `repo-harness-hook prompt-guard-decide`, que
devuelve un action enum desde una decision table explícita. Así la configuración
del host no cambia, pero la capa más propensa a errores —el classifier y la
state-machine— deja de estar dispersa en ramas condicionales de shell.

El invariante central: los hechos persistentes viven en el repositorio, no en la
ventana de chat. Los hooks son solo aceleradores y guardrails; la verdadera
authority son los archivos de plan, contract, review, checks y handoff.

## Task Workflow: de Plan a Closeout

El diagrama de abajo asume que el harness ya está instalado en el repositorio
objetivo. Muestra el ciclo cerrado normal de una sola tarea: primero se forma un
plan, luego se proyecta al sprint contract, cuando hace falta se hace checkout de
un worktree aislado, se implementa bajo la protección de los hooks, y después se
verifica, se hace review, external acceptance y, por último, closeout.

```mermaid
flowchart TD
  UserTask["Tarea de usuario o planning prompt"] --> Discovery["Investigación previa<br/>P1 map, P2 trace, P3 decision"]
  Discovery --> PlanDraft["Draft plan<br/>plans/plan-*.md"]
  PlanDraft --> PlanReview{"¿El plan es ejecutable?"}
  PlanReview -->|no| Refine["Converger scope y evidence contract"]
  Refine --> PlanDraft
  PlanReview -->|sí| Approve["Approved plan<br/>Status: Approved"]

  Approve --> Project["Proyectar a la superficie de ejecución<br/>capture-plan.sh --execute<br/>o plan-to-todo.sh --plan"]
  Project --> Active["Active markers<br/>.ai/harness/active-plan<br/>.ai/harness/active-worktree"]
  Project --> Contract["Sprint contract<br/>tasks/contracts/YYYYMMDD-HHMM-task-slug.contract.md"]
  Project --> ReviewFile["Review file<br/>tasks/reviews/YYYYMMDD-HHMM-task-slug.review.md"]
  Project --> Notes["Task notes<br/>tasks/notes/YYYYMMDD-HHMM-task-slug.notes.md"]

  Contract --> WorktreePolicy{"¿Se necesita un contract worktree?"}
  WorktreePolicy -->|sí| Checkout["Checkout de worktree aislado<br/>contract-worktree.sh start --plan<br/>branch codex/task-slug"]
  WorktreePolicy -->|no| CurrentTree["Usar el worktree actual<br/>tarea pequeña o slice explícitamente permitido"]
  Checkout --> Implement
  CurrentTree --> Implement

  Implement["Editar y ejecutar comandos"] --> PreHooks["Pre-edit guards<br/>PlanStatusGuard, ContractScopeGuard, WorktreeGuard"]
  PreHooks -->|blocked| ScopeFix["Corregir plan, contract, worktree o scope"]
  ScopeFix --> Implement
  PreHooks -->|allowed| Changes["Cambios de código, docs, tests o configuración"]
  Changes --> PostHooks["Post-edit / post-bash hooks<br/>trace, drift request, handoff, check evidence"]
  PostHooks --> Verify["Ejecutar verificación<br/>tests plus repo workflow checks"]

  Verify --> Checks["Evidence estructurada<br/>.ai/harness/checks/latest.json<br/>.ai/harness/runs/*.json"]
  Checks --> CheckReview["Evaluator review<br/>Waza /check -> review file"]
  CheckReview --> External["External acceptance advice<br/>o manual override explícito"]
  External --> DoneGate{"¿Pasan contract, checks, review y acceptance?"}
  DoneGate -->|no| Repair["Reparar la evidence fallida o la implementación"]
  Repair --> Implement
  DoneGate -->|sí| Closeout["Closeout<br/>scripts/contract-worktree.sh finish"]

  Closeout --> Commit["Commit del contract branch"]
  Commit --> Merge["Fast-forward del target branch"]
  Merge --> Archive["Archivar plan/todo y refrescar el handoff"]
  Archive --> Cleanup["Limpiar el worktree ya fusionado<br/>contract-worktree.sh cleanup"]
  Cleanup --> Done["Tarea completada y auditable"]
```

## Primeros 5 minutos

Esta es la ruta más rápida para evaluar si un repositorio real es apto para
adoptar este workflow.

### Instalar o refrescar el runtime local

```bash
npx -y repo-harness init
```

La npm package release line es ahora `0.2.x`; el workflow compatibility model line
generado se rastrea por separado como `5.x`. `repo-harness init` es el bootstrap
global y `repo-harness update` es el refresco repo-local. `repo-harness init`
configura el CLI, los hook adapters de nivel usuario, Waza, Mermaid, el brain
root y CodeGraph MCP; el viejo camino Claude plugin `scripts/setup-plugins.sh`
queda retirado.

Si trabajas desde un checkout del código fuente:

```bash
git clone https://github.com/Ancienttwo/repo-harness.git ~/Projects/repo-harness
cd ~/Projects/repo-harness
bun src/cli/index.ts init
```

Modelo de rutas locales:

- Repositorio fuente: `~/Projects/repo-harness`
- Claude skill aliases: `~/.claude/skills/repo-harness`, `~/.claude/skills/repo-harness-skill`
- Codex discoverable skill alias: `~/.codex/skills/repo-harness`
- Codex compatibility fallback alias: `~/.codex/skills/repo-harness-skill`

`~/Projects/repo-harness` es la única source of truth editable. Las rutas locales
de Claude/Codex son runtime entrypoints respaldados por symlinks. Los directorios
del runtime `project-initializer` ya retirado los limpia
`scripts/sync-codex-installed-copies.sh`.

### Prerrequisitos mínimos

- Git working tree
- `bash`
- `bun`, para la verificación posterior y el template assembly
- `jq` es opcional; se recomienda al hacer `--dry-run` y resulta más útil al
  aplicar el settings merge

### Empieza por aquí

En un repositorio existente, ejecuta desde el repo root:

```bash
npx -y repo-harness update --dry-run
```

Aplica solo después de que el reporte del dry-run sea correcto:

```bash
npx -y repo-harness update
```

Para un proyecto o módulo nuevo, usa la branch command `repo-harness-scaffold`.
Para un repositorio existente, usa `repo-harness update`; este instala o refresca
el harness y no crea el stack tecnológico de la aplicación.

### Cómo se ve el éxito

El comando debería terminar imprimiendo `=== Migration Report ===`, e incluir:

- `Project hooks synced from:`: de dónde proviene el comportamiento de los hooks generados
- `Host hook config target: user-level ~/.claude/settings.json and ~/.codex/hooks.json`: dónde está la capa del adapter
- `Host hook adapters are user-level:`: recordatorio de instalar los global adapters y de confiar en `~/.codex/hooks.json`
- `Workflow migration:`: el plan de creación o refresco de las repo-local harness surfaces
- `Helper scripts:`: la cadena de herramientas operativa que obtendrás tras aplicar
- `--- External Tooling ---`: el routing de gstack/Waza/gbrain más las advisory de instalación/actualización

### Los dos comandos siguientes

```bash
bash scripts/check-task-workflow.sh --strict
bun test
```

Si la salida del dry-run no es correcta, detente aquí primero y lee
[`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md).

## Hook Authority Map

- `.ai/hooks/` es la única shared hook implementation que se debe editar de forma prioritaria.
- `~/.claude/settings.json` es el Claude adapter a nivel de usuario, encargado de hacer dispatch a los opted-in repos.
- `~/.codex/hooks.json` es el Codex adapter a nivel de usuario, hace dispatch al mismo runner.
- Los hook adapters repo-local `.claude/settings.json` y `.codex/hooks.json` son legacy project-level config y deben retirarse durante la migración.
- Codex debe confiar en `~/.codex/hooks.json` en sus Settings para que los hooks se ejecuten.
- Orden de depuración: user-level adapter config -> `repo-harness-hook` o el fallback `repo-harness hook` -> route registry -> `.ai/hooks/*`.

`SessionStart` ejecuta dos scripts ordenados antes de empezar el trabajo:

```mermaid
flowchart LR
  SessionStart["Claude/Codex SessionStart"] --> Ctx["session-start-context.sh<br/>contexto de resume + handoff"]
  Ctx --> Sec["security-sentinel.sh<br/>escaneo de configuración de solo lectura, fingerprint-gated"]
  Sec --> SSOut["SessionStart additionalContext<br/>estado de la sesión anterior + hallazgos de SecurityConfig"]
```

El prompt guard tiene un paso interno adicional:

```mermaid
flowchart LR
  Host["Claude/Codex UserPromptSubmit"] --> Adapter["user-level adapter"]
  Adapter --> CLI["repo-harness-hook UserPromptSubmit --route default"]
  CLI --> Route["route registry"]
  Route --> Shell[".ai/hooks/prompt-guard.sh"]
  Shell --> Decision["repo-harness-hook prompt-guard-decide<br/>TypeScript decision table"]
  Decision --> Action["single action enum"]
  Action --> Shell
  Shell --> RouteHint["Waza route hint<br/>think/planning explícito coincide primero → /think"]
  Shell --> HostOutput["host-safe allow, advice, block, or done gate output"]
```

La capa de shell sigue teniendo la authority del sistema de archivos y los side
effects. TypeScript solo tiene el classifier más la decision table de
`intent x plan state`.

## Hook Failure Playbook

Cuando un hook block está activo, mira primero la salida estructurada en el
terminal. Los campos centrales son `guard`, `reason`, `fix`, `failure_class` y
`run_id`.

- Failure log: `.ai/harness/failures/latest.jsonl`
- Trace log: `.claude/.trace.jsonl`
- Guía detallada: [`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md)

Guards habituales:

- `PlanStatusGuard`: no hay active plan, o el plan todavía no puede ejecutarse
- `ContractGuard`: la approved execution aún no ha generado el scaffold de contract/review/notes
- `ContractGuard`: la tarea afirma estar completa sin haber pasado la contract verification
- `WorktreeGuard`: se escribe desde el primary worktree bajo una política que fuerza linked worktrees

## Repo Workflow

- Root routing docs: `CLAUDE.md`, `AGENTS.md`
- Shared hook layer: `.ai/hooks/`
- User-level adapter layer: `~/.claude/settings.json`, `~/.codex/hooks.json`
- Active execution surface: `tasks/`
- Plan source of truth: `plans/`
- Durable progress: `tasks/workstreams/`
- Release history: `docs/CHANGELOG.md`

## Release actual

- npm package: `repo-harness@0.2.4`
- Generated workflow compatibility: `5.2.3`
- GitHub repository: `Ancienttwo/repo-harness`
- Release history: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## Current Model (5.2.3)

- El question flow usa **12 grouped decision points**, infiriendo primero los harness defaults.
- El plan menu está por capas: los **Core Plans (A-F)** primero, los **Custom Presets (G-K)** solo cuando hace falta.
- El skill routing es inspection-first:
  - `scripts/inspect-project-state.ts`
  - `scripts/migrate-workflow-docs.ts`
  - `assets/workflow-contract.v1.json`
- Los generated repos usan por defecto el repo-local harness flow:
  - `docs/spec.md -> plans/ -> tasks/contracts/ -> tasks/reviews/ -> .ai/context/context-map.json -> .ai/harness/*`
- `repo-harness update` refresca las runtime pieces:
  - los `repo-harness` skill aliases
  - los global Codex/Claude hook adapters
  - las Waza skills: `think`, `hunt`, `check`, `health`
  - Mermaid
- El resto del external tooling se mantiene advisory-only:
  - `bash scripts/check-agent-tooling.sh --host both --check-updates`
  - no configura automáticamente gstack, gbrain, CodeGraph MCP, daemon ni provider

## Action Command Skills

Los command facades públicos están en `assets/skill-commands/`; preservan la
compatibilidad de discovery por skills, mientras el CLI y los hooks ejecutan:

- Planning / review: `repo-harness-plan`, `repo-harness-review`, `repo-harness-autoplan`
- Repo workflow actions: `repo-harness-ship`, `repo-harness-init`, `repo-harness-migrate`, `repo-harness-upgrade`, `repo-harness-capability`, `repo-harness-architecture`, `repo-harness-handoff`, `repo-harness-deploy`, `repo-harness-repair`, `repo-harness-check`
- Branch project creation: `repo-harness-scaffold`

`repo-harness update` se usa para repositorios existentes; `repo-harness-scaffold`
queda como branch command para crear proyectos o módulos nuevos. `hooks-init`, `docs-init` y
`create-project-dirs` son pasos internos, no commands públicos.

## Maintainer Reference

### Verificar el workflow contract de este repositorio

```bash
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
```

### Template assembly

```bash
bun scripts/assemble-template.ts --plan C --name "MyProject"
bun scripts/assemble-template.ts --target agents --plan C --name "MyProject"
```

### Verification

```bash
bun test
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
bash scripts/check-agent-tooling.sh --host both --check-updates
bun run benchmark:skills --dry-run
```

## Key Files

- Skill spec: `SKILL.md`
- Root routing docs: `CLAUDE.md`, `AGENTS.md`
- Plan mapping: `assets/plan-map.json`
- Question-pack: `assets/initializer-question-pack.v4.json`
- Shared hooks: `assets/hooks/`
- Workflow contract: `assets/workflow-contract.v1.json`
- Hook operations reference: `docs/reference-configs/hook-operations.md`
- Template assembler: `scripts/assemble-template.ts`
- State inspector: `scripts/inspect-project-state.ts`
- Legacy-doc migrator: `scripts/migrate-workflow-docs.ts`
