# repo-harness

<p align="center">
  <img src="docs/images/repo-harness-gptpro.png" alt="repo-harness architecture and ChatGPT Pro local planner workflow diagram" width="960">
</p>

`repo-harness` convierte las sesiones de programación con Claude/Codex en un
workflow repo-local repetible. Incluye un CLI y hooks de skill/runtime que
escriben contexto, planes, handoffs, checks y evidencias de review dentro del
proyecto, para que la siguiente sesión de agente continúe desde archivos y no
desde el historial de chat.

Úsalo para:

- adoptar un repositorio existente con un contrato de agente tasks-first
- mantener Claude y Codex alineados sobre los mismos planes, checks, handoffs y
  límites de contexto
- gastar menos tokens redescubriendo estructura gracias a CodeGraph y la carga
  progresiva de contexto

Entrega al agente un PRD o Sprint completo; después, tu bucle es solo review and
`next`, o iniciar `/goal` y quedar AFK.

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

Dirección del repositorio: `https://github.com/Ancienttwo/repo-harness`

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

En un repositorio adoptado, la superficie se mantiene pequeña:

| Surface | Propósito |
| --- | --- |
| `docs/spec.md` y `docs/reference-configs/` | Estándares compartidos e intención de producto estable que cada sesión de agente puede leer. |
| `plans/`, `plans/prds/` y `plans/sprints/` | Work packages decision-complete antes de empezar la implementación. |
| `tasks/contracts/`, `tasks/reviews/` y `.ai/harness/checks/` | Scope, verificación y evidencia de review para probar que el trabajo terminó. |
| `.ai/harness/handoff/` y `tasks/current.md` | Session journal y estado resumible, derivados de workflow artifacts en vez de chat memory. |

## Novedades en 0.7.1

- **ChatGPT browser engine.** `repo-harness chatgpt browser-*` crea sesiones
  ChatGPT Web repo-locales con archivos revisados por policy, sin usar OpenAI API.
- **MCP browser tools opt-in.** `repo-harness mcp serve
  --enable-chatgpt-browser` expone consult/read/list/continue/open; por defecto
  estos tools siguen desactivados.
- **Oracle y native providers.** El engine incluye un Oracle browser wrapper y
  un spike native vía Chrome instalado + CDP local.
- **Hosted CI y release smoke.** El repo añade un GitHub CI gate y un tarball
  install smoke que arranca los binarios empaquetados de `repo-harness`.

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
2. **Capa del contract del repositorio objetivo**: `repo-harness adopt` o la
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

## Bucles largos de producto

Para trabajo Greenfield y Brownfield, adelanta la discovery y el juicio de
engineering plan en Claude-Fable antes de pedirle a Codex que haga loops de
ejecución:

1. En Claude-Fable, usa gstack `office-hours` para product discovery o
   `plan-eng-review` para review del plan de ingeniería. La salida debe ser los
   development documents que fijan la intención de producto, la arquitectura, los
   riesgos y el evidence contract.
2. Convierte esos documentos en un PRD Sprint bajo `plans/prds/`, con un
   backlog ordenado y sub-plans detallados para cada execution slice.
3. Crea un Codex Goal que apunte a ese archivo de sprint. repo-harness puede
   entonces proyectar cada sprint item por el flow normal plan -> contract ->
   worktree -> verification.

Ese handoff mantiene precisos los loops largos: Claude-Fable se ocupa del juicio
amplio al inicio, el PRD Sprint es la durable source of truth, y Codex Goal mode
retoma contra un sprint concreto en vez de reinterpretar el chat original.

## Primeros 5 minutos

Esta es la ruta más rápida para evaluar si un repositorio real es apto para
adoptar este workflow.

### Instalar el CLI

La ruta por defecto no requiere Node.js: el instalador usa Bun como runtime. Si
Bun no existe, instala Bun primero y después instala el CLI `repo-harness`.

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex
```

<details>
<summary>¿Ya tienes Bun o Node? Usa gestores de paquetes</summary>

```bash
# Bun
bun add -g repo-harness
repo-harness init

# Node/npm, con Bun ya en PATH porque el CLI corre sobre Bun
npx -y repo-harness init
```

</details>

### Bootstrap del runtime del host

```bash
repo-harness init
```

`repo-harness init` es el bootstrap global, `repo-harness update` es el refresco
user-level y `repo-harness adopt` es el refresco repo-local. `repo-harness init`
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
- Claude skill alias: `~/.claude/skills/repo-harness`
- Codex discoverable skill alias: `~/.codex/skills/repo-harness`

`~/Projects/repo-harness` es la única source of truth editable. Las rutas locales
de Claude/Codex son runtime entrypoints respaldados por symlinks. Los directorios
de los runtimes ya retirados `repo-harness-skill` y `project-initializer` los
elimina `scripts/sync-codex-installed-copies.sh`.

### Prerrequisitos mínimos

- Git working tree
- `bash`
- `bun`, para la verificación posterior y el template assembly
- `jq` es opcional; se recomienda al hacer `--dry-run` y resulta más útil al
  aplicar el settings merge

### Empieza por aquí

En un repositorio existente, ejecuta desde el repo root:

```bash
npx -y repo-harness adopt --dry-run
```

Aplica solo después de que el reporte del dry-run sea correcto:

```bash
npx -y repo-harness adopt
```

Para un proyecto o módulo nuevo, usa la branch command `repo-harness-scaffold`.
Para un repositorio existente, usa `repo-harness adopt`; este instala o refresca
el harness y no crea el stack tecnológico de la aplicación.

### Cómo se ve el éxito

El comando debería terminar imprimiendo `=== Migration Report ===`, e incluir:

- `Project hooks synced from:`: de dónde proviene el comportamiento de los hooks generados
- `Host hook config target: user-level ~/.claude/settings.json and ~/.codex/hooks.json`: dónde está la capa del adapter
- `Host hook adapters are user-level:`: recordatorio de instalar los global adapters y de confiar en `~/.codex/hooks.json`
- `Workflow migration:`: el plan de creación o refresco de las repo-local harness surfaces
- `Helper runtime:`: la cadena de herramientas operativa que obtendrás tras aplicar
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


The installed adapter owns eight managed hook routes. The route tuple
`event + routeId + matcher` is the stable contract; script names are the current
implementation under `assets/hooks/` or a repo-pinned `.ai/hooks/` copy.

| Route | Matcher | Scripts | Function |
| --- | --- | --- | --- |
| `SessionStart.default` | all sessions | `session-start-context.sh`, `security-sentinel.sh` | Injects prior handoff, sprint status, and read-only config-security findings before work starts. |
| `PreToolUse.edit` | `Edit|Write` | `worktree-guard.sh`, `pre-edit-guard.sh` | Enforces worktree policy and plan/contract readiness before implementation edits. |
| `PreToolUse.subagent` | `Task|Agent|SendUserMessage` | `subagent-return-channel-guard.sh` | Keeps delegated work returning through the parent session instead of leaking completion claims. |
| `PostToolUse.edit` | `Edit|Write` | `post-edit-guard.sh` | Records edit traces, refreshes handoff/task status, and queues architecture drift when controlled files change. |
| `PostToolUse.bash` | `Bash` | `post-bash.sh` | Observes command results and captures verification evidence without replacing the command runner. |
| `PostToolUse.always` | all tools | `post-tool-observer.sh` | Provides low-noise always-on trace and runtime observation; stale pinned copies soft-skip with a refresh hint. |
| `UserPromptSubmit.default` | all prompts | `prompt-guard.sh` | Classifies prompt intent, routes planning/check/hunt hints, and renders host-safe workflow guidance. |
| `Stop.default` | session stop | `stop-orchestrator.sh` | Finalizes handoff and guards against ending with unresolved draft-plan or completion evidence gaps. |

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

- npm package: `repo-harness@0.7.1`
- Generated workflow stamp: `repo-harness@0.7.1+template@0.7.1`
- GitHub repository: `Ancienttwo/repo-harness`
- Release history: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## Current Model

- El question flow usa **12 grouped decision points**, infiriendo primero los harness defaults.
- El plan menu está por capas: los **Core Plans (A-F)** primero, los **Custom Presets (G-K)** solo cuando hace falta.
- El skill routing es inspection-first:
  - `scripts/inspect-project-state.ts`
  - `scripts/migrate-workflow-docs.ts`
  - `assets/workflow-contract.v1.json`
- Runtime mode is configurable with template vars:
  - `{{RUNTIME_MODE}}`
  - `{{RUNTIME_PROFILE}}`
  - `{{RECOVERY_PROFILE}}`
  - `{{STATE_PROFILE}}`
- Question-pack source of truth is in:
  - `assets/initializer-question-pack.v4.json`
- Los generated repos usan por defecto el repo-local harness flow:
  - `docs/spec.md -> plans/ -> tasks/contracts/ -> tasks/reviews/ -> .ai/context/context-map.json -> .ai/harness/*`
- `repo-harness update` refresca las runtime pieces de usuario:
  - los `repo-harness` skill aliases
  - los global Codex/Claude hook adapters
  - las Waza skills: `think`, `hunt`, `check`, `health`
  - Mermaid
- El resto del external tooling se mantiene advisory-only:
  - `bash scripts/check-agent-tooling.sh --host both --check-updates`
  - no configura automáticamente gstack, gbrain, CodeGraph MCP, daemon ni provider

## Agradecimientos

Gracias a [Hylarucoder](https://x.com/hylarucoder) por su contribución
metodológica. El método P1/P2/P3 due-diligence de `repo-harness`, y la práctica
Geju que disciplina el planning, el trace y el decision rationale, vienen de su
contribución e influencia.

Gracias a [TW93](https://x.com/HiTw93), autor de Waza. Los skills centrales
`think`, `hunt`, `check` y `health` dan forma al ritmo diario de planning, bug
hunt y verification de `repo-harness`.

Gracias a [Garry Tan](https://x.com/garrytan), autor de gstack y gbrain. Ambos
influyeron en el workflow de product discovery, plan/design review, release
documentation, knowledge sync y handoff retrieval.


### Atribución de contribuidor en GitHub

Cuando Codex contribuya materialmente a un commit, usa el trailer co-author estándar de GitHub al final del commit message:

```text
Co-authored-by: codex <codex@openai.com>
```

Mantén esta atribución opt-in y visible por commit. No la incorpores en scripts de commit ni hooks downstream de repo-harness salvo que ese repo adopte explícitamente la misma política.

## Action Command Skills

Los command facades públicos están en `assets/skill-commands/`; preservan la
compatibilidad de discovery por skills, mientras el CLI y los hooks ejecutan:

- Planning / review: `repo-harness-plan`, `repo-harness-review`, `repo-harness-autoplan`
- Product planning layer: `repo-harness-prd` (activa `$geju`, luego usa drafting Claude-first con `claude -p --model opus`; Codex queda solo como fallback)
- Sprint program layer: `repo-harness-sprint` (convierte un PRD en un backlog ordenado bajo `plans/sprints/`)
- Goal session layer: `repo-harness-goal` / `repo-harness:goal` (prepara prompts `/goal` de Codex/Claude desde un PRD o Sprint detallado; si falta el documento, lo pide primero)
- Repo workflow actions: `repo-harness-ship`, `repo-harness-init`, `repo-harness-migrate`, `repo-harness-upgrade`, `repo-harness-capability`, `repo-harness-architecture`, `repo-harness-handoff`, `repo-harness-deploy`, `repo-harness-repair`, `repo-harness-check`
- Branch project creation: `repo-harness-scaffold`

La cadena de planning está separada por capas:

```text
idea -> repo-harness-prd -> repo-harness-sprint from-prd -> repo-harness-goal
```

Usa `repo-harness-prd` cuando la fuente todavía es una idea de producto: primero
ejecuta un direction pass con `$geju`, luego pide a Claude vía `claude -p --model opus` que
redacte el PRD, con Codex solo como fallback. Usa
`repo-harness-sprint from-prd <plans/prds/*.prd.md>` para convertir un PRD
aprobado en un Sprint backlog ordenado con acceptance lines verificables por
máquina. Usa `repo-harness-goal` solo cuando ya exista un PRD o Sprint detallado;
prepara un prompt `/goal` acotado para Codex/Claude y mantiene el PRD/Sprint como
source of truth. Si falta ese documento, el goal command debe pedirlo antes de
empezar implementación desde el chat.

`repo-harness adopt` se usa para repositorios existentes; `repo-harness-scaffold`
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


### Runtime reference docs

Generic repo-harness runtime/reference docs live in the installed package under
`assets/reference-configs/` and are resolved through the CLI:

```bash
repo-harness docs list
repo-harness docs path harness-overview
repo-harness docs show harness-overview
```

Generated and migrated repos still keep `docs/reference-configs/*.md`, but
those files are deterministic pointer stubs. Repo-local workflow state,
policy, checks, runs, handoff packets, context maps, and helper snapshots stay
under `.ai/`.

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
bun run benchmark:skills --eval route-workflow-check
```


### Local benchmark skeleton

```bash
bun run benchmark:skills --eval route-workflow-check
```

Eval output is the release/readiness evidence path; dry-run benchmark wiring is only a smoke and is not skill-effectiveness evidence.


### Run one eval across both Claude and Codex

```bash
bun run benchmark:skills --eval repair-agents-task-sync
```

## Key Files

- Skill spec: `SKILL.md`
- Root routing docs: `CLAUDE.md`, `AGENTS.md`
- Plan mapping: `assets/plan-map.json`
- Question-pack: `assets/initializer-question-pack.v4.json`
- Shared hooks: `assets/hooks/`
- Runtime reference docs: `assets/reference-configs/` via `repo-harness docs`
- Workflow contract: `assets/workflow-contract.v1.json`
- Hook operations reference: `docs/reference-configs/hook-operations.md`
- Template assembler: `scripts/assemble-template.ts`
- State inspector: `scripts/inspect-project-state.ts`
- External tooling detector: `scripts/check-agent-tooling.sh`
- Scaffolding scripts:
  - `scripts/init-project.sh`
  - `scripts/create-project-dirs.sh`
- Legacy-doc migrator: `scripts/migrate-workflow-docs.ts`

## Generated vs Self-Hosted Hook Parity

- El comportamiento downstream de hooks lo define la salida generada desde `assets/hooks/` y `assets/reference-configs/`.
- Este repo dogfoodea el mismo contract, pero el comportamiento self-host no se sincroniza mágicamente con los generated repos; cada cambio debe actualizar explícitamente ambas superficies cuando aplique.
- Todo cambio de hook debe indicar si afecta a `self-host`, `generated` o `both`.

## Package Manager Defaults

- Prioridad general por defecto: `bun > pnpm > npm`
- **Plan G/H** (Python-centric) usa **`uv`** como primary package manager por defecto.

## Runtime Profiles

- `Plan-only (recommended)` (default)
- `Plan + Permissionless`
- `Standard (ask before each action)`

Se configura en `assets/initializer-question-pack.v4.json` y lo consume `scripts/initializer-question-pack.ts`.

## Verification

Para release review usa el gate único equivalente a CI:

```bash
bun run check:ci
```

Ese gate se expande a los checks propios del repo; `bun run check:release` solo añade el preflight de npm unpublished-version antes de delegar al mismo gate.

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
bash scripts/check-agent-tooling.sh --host both --check-updates
bun run benchmark:skills --eval route-workflow-check
```
