# repo-harness

<p align="center">
  <img src="docs/images/repo-harness-gptpro.png" alt="repo-harness architecture and ChatGPT Pro local planner workflow diagram" width="960">
</p>

`repo-harness` transforme les sessions de code Claude/Codex en workflow
repo-local répétable. Il fournit un CLI et des hooks skill/runtime qui écrivent
le contexte, les plans, les handoffs, les checks et les preuves de review dans le
projet, afin que la session d'agent suivante reprenne depuis les fichiers plutôt
que depuis l'historique de chat.

Utilisez-le pour :

- adopter un dépôt existant avec un contrat d'agent tasks-first
- garder Claude et Codex alignés sur les mêmes plans, checks, handoffs et limites
  de contexte
- dépenser moins de tokens à redécouvrir la structure grâce à CodeGraph et au
  chargement progressif du contexte

Donnez à l'agent un PRD ou Sprint complet ; ensuite, votre boucle se limite à
review and `next`, ou à lancer `/goal` puis passer AFK.

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

Adresse du dépôt : `https://github.com/Ancienttwo/repo-harness`

## Pourquoi utiliser repo-harness

- **L'état de session vit dans les fichiers, pas dans l'historique de chat.** Des
  sessions d'agent distinctes — Claude, Codex, maintenant ou plus tard — restent
  synchronisées via le dépôt et non via un thread de conversation. Au démarrage
  d'une nouvelle session, `.ai/hooks/session-start-context.sh` injecte le resume
  packet de la session précédente (`.ai/harness/handoff/resume.md`,
  `tasks/current.md`) ; à la fin de la session et après chaque édition,
  `finalize-handoff.sh` et `post-edit-guard.sh` réécrivent le handoff suivant. Une
  tâche peut s'interrompre en cours de route, et la session suivante reprend
  directement avec l'étape suivante exacte, les points de blocage et les fichiers
  modifiés, sans avoir à les redéduire.
- **Économe en tokens par conception.** Au lieu de boucles grep+read qui
  rescannent le dépôt à chaque session, le harness s'appuie sur un index CodeGraph
  pré-construit pour les requêtes structurelles (qui appelle, qui est appelé, où
  c'est défini), puis sur un chargement de contexte progressif via
  `.ai/context/context-map.json` et `capabilities.json` : un root context petit et
  stable (environ 12 Ko), plus des blocs capability chargés uniquement quand les
  fichiers que vous touchez en ont besoin. Un agent lit un contrat capability de
  1 Ko ou interroge l'index, au lieu de dépenser des milliers de tokens à
  redécouvrir la structure.

Dans un dépôt adopté, la surface à comprendre reste volontairement réduite :

| Surface | Rôle |
| --- | --- |
| `docs/spec.md` et `docs/reference-configs/` | Standards partagés et intention produit stable lisibles par chaque session d'agent. |
| `plans/`, `plans/prds/` et `plans/sprints/` | Work packages decision-complete avant le début de l'implémentation. |
| `tasks/contracts/`, `tasks/reviews/` et `.ai/harness/checks/` | Scope, vérification et preuves de review pour démontrer que le travail est terminé. |
| `.ai/harness/handoff/` et `tasks/current.md` | Session journal et état resumable dérivés des workflow artifacts plutôt que de la chat memory. |

## Human Review Path

Commencez par `tasks/reviews/<task>.review.md`. La `## Human Review Card` est la
surface de décision sur un seul écran : verdict, change type, fichiers prévus vs
réels, commandes passées, external acceptance, risque résiduel, action du
reviewer et rollback. Inspectez ensuite le contract actif, le dernier trace dans
`.ai/harness/checks/latest.json` et les fichiers modifiés. N'acceptez que lorsque
la review recommande pass, que le verdict de la card est pass et que l'external
acceptance est pass, `not_required` ou un manual override explicite.

## Agent Tracking Path

Les agents lisent les source artifacts avant les résumés dérivés :

| Agent reads first | Human reviews first |
| --- | --- |
| Prompt utilisateur courant et fichiers référencés | Human Review Card de `tasks/reviews/<task>.review.md` |
| `AGENTS.md` / `CLAUDE.md` | Fichiers modifiés et diff |
| Plan actif dans `.ai/harness/active-plan` | Allowed paths et exit criteria du contract actif |
| Contract actif dans `tasks/contracts/` | `.ai/harness/checks/latest.json` et run trace |
| Dernier handoff dans `.ai/harness/handoff/` | Risques résiduels et rollback |

`tasks/current.md` n'est qu'un snapshot d'orientation. S'il diverge du plan
actif, du contract, de la review, des checks ou du handoff, les source artifacts
l'emportent.

## Nouveautés

Les notes de version vivent dans [`docs/CHANGELOG.md`](docs/CHANGELOG.md). La
ligne actuelle est `0.10.0`.

## Comment ça marche

L'ensemble se découpe en trois couches :

1. **Couche package source** : ce dépôt maintient le CLI, les command skill
   facades, les templates, les hook assets, le workflow contract, les tests et le
   release gate.
2. **Couche contrat du dépôt cible** : `repo-harness adopt` ou une migration écrit
   `docs/spec.md`, `plans/`, `tasks/`, `.ai/context/`, `.ai/harness/`, les helper
   scripts et `.ai/hooks/`.
3. **Couche host adapter** : les `~/.claude/settings.json` et `~/.codex/hooks.json`
   de niveau utilisateur routent les events Claude/Codex vers `repo-harness-hook`.
   Le hook entrypoint vérifie d'abord si le dépôt courant possède un
   `.ai/harness/workflow-contract.json` ; sans opt in, il sort silencieusement, et
   ce n'est qu'avec opt in qu'il entre dans les `.ai/hooks/*` du dépôt courant.

Pour `UserPromptSubmit`, l'adapter contract public reste
`repo-harness-hook UserPromptSubmit --route default`. La route registry du CLI
dispatche cette route vers `.ai/hooks/prompt-guard.sh`. Le shell hook continue
d'assurer le parsing du host JSON, la lecture des fichiers de workflow, les
effets de bord de plan capture, le rendu du quality gate, ainsi qu'un
stdout/stderr host-safe. La décision sur le prompt intent et le workflow state
est confiée au TypeScript decision engine derrière
`repo-harness-hook prompt-guard-decide` ; il renvoie un action enum depuis une
decision table explicite. Ainsi, la configuration du host reste inchangée, mais
la couche classifier/state-machine, la plus sujette aux erreurs, n'est plus
éparpillée dans des branches conditionnelles de shell.

Invariant central : les faits persistants vivent dans le dépôt, pas dans la
fenêtre de chat. Les hooks ne sont que des accélérateurs et des guardrails ;
l'authority réelle, ce sont les fichiers de plan, contract, review, checks et
handoff.

## Task Workflow : de Plan à Closeout

Le diagramme ci-dessous suppose que le harness est déjà installé dans le dépôt
cible. Il montre le cycle normal d'une tâche unique : d'abord former un plan,
puis le projeter dans le sprint contract, faire un checkout d'un worktree isolé
si nécessaire, implémenter sous la protection des hooks, puis vérifier, review,
external acceptance, et enfin closeout.

```mermaid
flowchart TD
  UserTask["Tâche utilisateur ou planning prompt"] --> Discovery["Due diligence préalable<br/>P1 map, P2 trace, P3 decision"]
  Discovery --> PlanDraft["Draft plan<br/>plans/plan-*.md"]
  PlanDraft --> PlanReview{"Le plan est-il exécutable ?"}
  PlanReview -->|non| Refine["Resserrer le scope et l'evidence contract"]
  Refine --> PlanDraft
  PlanReview -->|oui| Approve["Approved plan<br/>Status: Approved"]

  Approve --> Project["Projeter sur la surface d'exécution<br/>capture-plan.sh --execute<br/>ou plan-to-todo.sh --plan"]
  Project --> Active["Active markers<br/>.ai/harness/active-plan<br/>.ai/harness/active-worktree"]
  Project --> Contract["Sprint contract<br/>tasks/contracts/YYYYMMDD-HHMM-task-slug.contract.md"]
  Project --> ReviewFile["Review file<br/>tasks/reviews/YYYYMMDD-HHMM-task-slug.review.md"]
  Project --> Notes["Task notes<br/>tasks/notes/YYYYMMDD-HHMM-task-slug.notes.md"]

  Contract --> WorktreePolicy{"Un contract worktree est-il requis ?"}
  WorktreePolicy -->|oui| Checkout["Checkout d'un worktree isolé<br/>contract-worktree.sh start --plan<br/>branch codex/task-slug"]
  WorktreePolicy -->|non| CurrentTree["Utiliser le worktree courant<br/>petite tâche ou slice explicitement autorisée"]
  Checkout --> Implement
  CurrentTree --> Implement

  Implement["Éditer et exécuter des commandes"] --> PreHooks["Pre-edit guards<br/>PlanStatusGuard, ContractScopeGuard, WorktreeGuard"]
  PreHooks -->|blocked| ScopeFix["Corriger plan, contract, worktree ou scope"]
  ScopeFix --> Implement
  PreHooks -->|allowed| Changes["Changements de code, docs, tests ou config"]
  Changes --> PostHooks["Post-edit / post-bash hooks<br/>trace, drift request, handoff, check evidence"]
  PostHooks --> Verify["Lancer la vérification<br/>tests plus repo workflow checks"]

  Verify --> Checks["Evidence structurée<br/>.ai/harness/checks/latest.json<br/>.ai/harness/runs/*.json"]
  Checks --> CheckReview["Evaluator review<br/>Waza /check -> review file"]
  CheckReview --> External["External acceptance advice<br/>ou manual override explicite"]
  External --> DoneGate{"Contract, checks, review, acceptance passent-ils ?"}
  DoneGate -->|non| Repair["Réparer l'evidence ou l'implémentation en échec"]
  Repair --> Implement
  DoneGate -->|oui| Closeout["Closeout<br/>scripts/contract-worktree.sh finish"]

  Closeout --> Commit["Commit de la contract branch"]
  Commit --> Merge["Fast-forward de la target branch"]
  Merge --> Archive["Archiver plan/todo et rafraîchir le handoff"]
  Archive --> Cleanup["Nettoyer le worktree mergé<br/>contract-worktree.sh cleanup"]
  Cleanup --> Done["Tâche terminée et auditable"]
```

## Longues boucles produit

Pour le travail Greenfield comme Brownfield, avancez la discovery et le jugement
d'engineering plan dans le parent agent avant de demander à Codex de boucler sur
l'exécution :

1. Avant la création d'un contract, le parent agent invoque `geju` pour ouvrir le
   cadre, puis réalise P1/P2/P3 avec ses propres capacités repo/runtime. Il fige
   l'intention produit, l'architecture, les risques, le falsifier et l'evidence
   contract acceptés dans les development documents.
2. Transformez ces documents en PRD Sprint sous `plans/prds/`, avec un backlog
   ordonné et des sub-plans détaillés pour chaque execution slice.
3. Créez un Codex Goal qui pointe vers ce fichier de sprint. repo-harness peut
   ensuite projeter chaque sprint item dans le flow normal plan -> contract ->
   worktree -> verification.

Ce handoff rend les longues boucles plus précises : le parent agent porte le
jugement large en amont, le PRD Sprint devient la durable source of truth, et
Codex Goal mode reprend sur un sprint concret au lieu de réinterpréter le chat
initial.

## Les 5 premières minutes

C'est le chemin le plus rapide pour évaluer si un dépôt réel se prête à l'adoption
de ce workflow.

Prérequis : un Git working tree, `bash` et `bun` (pour la vérification ultérieure
et le template assembly). `jq` est optionnel pour `--dry-run`, mais recommandé
lors de l'application d'un settings merge.

### 1. Installer le CLI

Le chemin par défaut ne demande pas Node.js : l'installateur utilise Bun >=
1.1.35 comme runtime. Si Bun est absent ou plus ancien, il l'installe ou le met
à niveau avant d'installer le CLI `repo-harness`.

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex
```

<details>
<summary>Vous avez déjà Bun >= 1.1.35 ? Utilisez Bun en priorité, ou npx en fallback</summary>

```bash
# Bun (recommandé)
bun add -g repo-harness
repo-harness install

# Fallback npx, avec Bun déjà sur PATH car le CLI s'exécute sur Bun
npx -y repo-harness@latest install
```

</details>

### 2. Bootstrap du runtime hôte

```bash
repo-harness install
```

`repo-harness install` sert au bootstrap global, `repo-harness update` au
rafraîchissement user-level, et `repo-harness adopt` au rafraîchissement
repo-local. `repo-harness install` configure le CLI, les hook adapters de niveau
utilisateur, Waza, Mermaid, le brain root et CodeGraph MCP ; l'ancien chemin
Claude plugin `scripts/setup-plugins.sh` est retiré.

### 3. Prévisualiser le contrat repo-local

```bash
repo-harness adopt --dry-run
```

Lancez le dry-run depuis le repo root. Il rapporte les specs, l'état des tasks,
le helper runtime, la cible des hook adapters et les fichiers de vérification qui
seraient créés ou rafraîchis. Il ne doit pas créer de stack applicatif : un dépôt
existant utilise `repo-harness adopt`, un nouveau projet ou module utilise
`repo-harness-scaffold`.

### 4. Appliquer, puis prouver le workflow

```bash
repo-harness adopt
bash scripts/check-task-workflow.sh --strict
bun test
```

Après application, le dépôt doit avoir un contract file-backed auditable plutôt
qu'une configuration de chat propre à un outil. Pour un nouveau projet ou module,
utilisez `repo-harness-scaffold` au lieu de `adopt`. Les maintainers éditant le
package lui-même ont besoin d'un source checkout — voir
[Maintainer Reference](#maintainer-reference).

### À quoi ressemble le succès

La commande doit se terminer par `=== Migration Report ===` et inclure :

- `Project hooks synced from:` : d'où vient le comportement des hooks générés
- `Host hook config target: user-level ~/.claude/settings.json and ~/.codex/hooks.json` : où se trouve la couche adapter
- `Host hook adapters are user-level:` : rappel d'installer les global adapters, et de faire confiance à `~/.codex/hooks.json`
- `Workflow migration:` : le plan de création ou de rafraîchissement des repo-local harness surfaces
- `Helper runtime:` : la chaîne d'outils opérationnels obtenue après application
- `--- External Tooling ---` : le guide de planning parent/Geju, la readiness Waza/gbrain et les conseils d'installation/mise à jour advisory

Si la sortie du dry-run est incorrecte, arrêtez-vous ici et lisez
[`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md).

## MCP Connector Quickstart

En sidecar optionnel, `repo-harness mcp` n'expose que les workflow artifacts aux
clients MCP. ChatGPT agit comme planner/reviewer qui lit l'état et fait avancer
une idée à travers les artifacts PRD, checklist Sprint et Codex goal handoff —
sans accès en écriture au source-code, sans exécution shell arbitraire ni Codex
runner par défaut. Codex reste l'exécuteur.

Ce sidecar suppose que le CLI est déjà installé via « Les 5 premières minutes »
ci-dessus. Utilisez-le quand vous voulez que ChatGPT planifie sur l'état réel du
dépôt et que Codex exécute le Sprint file-backed qui en résulte.

```bash
repo-harness mcp setup chatgpt --repo .
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

Exposez ce server local via un tunnel HTTPS et créez un Connector ChatGPT avec
l'URL `/mcp`. Le guide généré est écrit dans :

```text
docs/repo-harness-chatgpt-mcp-setup.md
```

Le human workflow est le suivant :

1. ChatGPT lit les fichiers de workflow de repo-harness via MCP.
2. ChatGPT écrit un PRD avec `write_prd_from_idea`.
3. ChatGPT écrit un Sprint checklist avec `write_checklist_sprint`.
4. ChatGPT prépare `.ai/harness/handoff/codex-goal.md` avec `prepare_codex_goal_from_sprint`.
5. Codex exécute le prompt host-native `/goal` et stage chaque Sprint phase terminée.

Repli local pour la dernière étape de handoff :

```bash
repo-harness mcp prepare-goal --repo . --prd plans/prds/<feature>.prd.md --sprint plans/sprints/<feature>.sprint.md
```

Le Skill destiné à l'agent est installé dans :

```text
.agents/skills/repo-harness-chatgpt-bridge/SKILL.md
```

Ce Skill explique à Codex comment consommer les artifacts PRD/Sprint/Goal
produits par ChatGPT sans accorder à ChatGPT d'écriture sur le source-code ni
d'exécution shell.

Le Dev Mode peut opter pour l'exécution locale d'agents via MCP. C'est désactivé
par défaut. Quand l'utilisateur active le profile `orchestrator` avec le réglage
dev runner, ChatGPT peut appeler `run_agent_goal`, qui lit uniquement
`.ai/harness/handoff/codex-goal.md` et exécute le handoff fixe via un CLI local
autorisé tel que `codex exec` ou `claude -p`.

```bash
repo-harness mcp serve --repo . --transport http --profile orchestrator --enable-dev-runner --dev-runner-agents codex
```

Ce réglage est réservé au Developer Mode local. Il est borné par un timeout,
audité, et ce n'est pas un shell arbitraire.

## Hook Authority Map

- `.ai/hooks/` est l'unique shared hook implementation qu'il faut éditer en priorité.
- `~/.claude/settings.json` est l'adapter Claude de niveau utilisateur, chargé de dispatcher vers les opted-in repos.
- `~/.codex/hooks.json` est l'adapter Codex de niveau utilisateur, qui dispatche vers le même runner.
- Les hook adapters repo-local `.claude/settings.json` et `.codex/hooks.json` sont une legacy project-level config et doivent être retirés lors de la migration.
- Codex doit faire confiance à `~/.codex/hooks.json` dans Settings pour que les hooks s'exécutent.
- Ordre de débogage : user-level adapter config -> `repo-harness-hook` ou fallback `repo-harness hook` -> route registry -> `.ai/hooks/*`.


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

`SessionStart` exécute deux scripts ordonnés avant le début du travail :

```mermaid
flowchart LR
  SessionStart["Claude/Codex SessionStart"] --> Ctx["session-start-context.sh<br/>resume + handoff context"]
  Ctx --> Sec["security-sentinel.sh<br/>read-only config scan, fingerprint-gated"]
  Sec --> SSOut["SessionStart additionalContext<br/>prior-session state + SecurityConfig findings"]
```

Le prompt guard ajoute une étape interne supplémentaire :

```mermaid
flowchart LR
  Host["Claude/Codex UserPromptSubmit"] --> Adapter["user-level adapter"]
  Adapter --> CLI["repo-harness-hook UserPromptSubmit --route default"]
  CLI --> Route["route registry"]
  Route --> Shell[".ai/hooks/prompt-guard.sh"]
  Shell --> Decision["repo-harness-hook prompt-guard-decide<br/>TypeScript decision table"]
  Decision --> Action["single action enum"]
  Action --> Shell
  Shell --> RouteHint["Waza route hint<br/>explicit think/planning matched first → /think"]
  Shell --> HostOutput["host-safe allow, advice, block, or done gate output"]
```

La couche shell conserve l'authority sur le filesystem et les effets de bord. Le
TypeScript ne possède que le classifier plus la decision table
`intent x plan state`.

## Hook Failure Playbook

Quand un hook block fonctionne, regardez d'abord la sortie structurée dans le
terminal. Les champs clés sont `guard`, `reason`, `fix`, `failure_class` et
`run_id`.

- Failure log : `.ai/harness/failures/latest.jsonl`
- Trace log : `.claude/.trace.jsonl`
- Guide approfondi : [`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md)

Guards courants :

- `PlanStatusGuard` : pas d'active plan, ou le plan n'est pas encore exécutable
- `ContractGuard` : une approved execution n'a pas encore généré le scaffold contract/review/notes
- `ContractGuard` : la tâche est déclarée terminée avant d'avoir passé la contract verification
- `WorktreeGuard` : écriture depuis le primary worktree alors que la politique des linked worktrees est appliquée

## Repo Workflow

- Root routing docs : `CLAUDE.md`, `AGENTS.md`
- Shared hook layer : `.ai/hooks/`
- User-level adapter layer : `~/.claude/settings.json`, `~/.codex/hooks.json`
- Active execution surface : `tasks/`
- Plan source of truth : `plans/`
- Durable progress : `tasks/workstreams/`
- Release history : `docs/CHANGELOG.md`

## Release actuelle

- npm package : `repo-harness@0.10.0`
- Generated workflow stamp : `repo-harness@0.10.0+template@0.10.0`
- GitHub repository : `Ancienttwo/repo-harness`
- Release history : [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## Remerciements

Merci à [Hylarucoder](https://x.com/hylarucoder) pour sa contribution
méthodologique. La méthode P1/P2/P3 due-diligence de `repo-harness`, ainsi que
la pratique Geju qui structure le planning, le trace et le decision rationale,
viennent de sa contribution et de son influence.

Merci à [TW93](https://x.com/HiTw93), auteur de Waza. Les skills centraux
`think`, `hunt`, `check` et `health` structurent le rythme quotidien de planning,
bug hunt et verification de `repo-harness`.

Merci à [Garry Tan](https://x.com/garrytan), auteur de gbrain. Il a influencé le
workflow de release documentation, knowledge sync et handoff retrieval.

Merci à [Peter Steinberger](https://x.com/steipete), auteur d'Oracle
(`@steipete/oracle`, MIT). C'est le moteur de consult navigateur GPT Pro /
ChatGPT Web par défaut de `chatgpt-browser` : le provider Oracle lance le binaire
oracle externe pour les consults `gptpro`, sans téléchargement automatique, et un
binaire manquant est une erreur franche.


### Attribution GitHub des contributeurs

Lorsque Codex contribue matériellement à un commit, utilisez le trailer co-author standard de GitHub à la fin du commit message :

```text
Co-authored-by: codex <codex@openai.com>
```

Gardez cette attribution opt-in et visible commit par commit. Ne l'intégrez pas aux scripts de commit ni aux hooks repo-harness downstream sauf si ce dépôt adopte explicitement la même politique.

## Action Command Skills

Les command facades publics se trouvent dans `assets/skill-commands/` ; ils
préservent la découverte par skills, tandis que l'exécution appartient au CLI et
aux hooks :

- Planning / review : `repo-harness-plan`, `repo-harness-review`, `repo-harness-autoplan`
- Product planning layer : `repo-harness-prd` (active `$geju`, puis rédige en Claude-first avec `claude -p --model opus` ; Codex ne sert que de fallback)
- Sprint program layer : `repo-harness-sprint` (transforme un PRD en backlog ordonné dans `plans/sprints/`)
- Goal session layer : `repo-harness-goal` / `repo-harness:goal` (prépare des prompts `/goal` Codex/Claude depuis un PRD ou Sprint détaillé ; si le document manque, il le demande d'abord)
- Repo workflow actions : `repo-harness-ship`, `repo-harness-init`, `repo-harness-migrate`, `repo-harness-upgrade`, `repo-harness-capability`, `repo-harness-architecture`, `repo-harness-handoff`, `repo-harness-deploy`, `repo-harness-repair`, `repo-harness-check`
- Branch project creation : `repo-harness-scaffold`

La chaîne de planning est volontairement découpée en couches :

```text
idea -> repo-harness-prd -> repo-harness-sprint from-prd -> repo-harness-goal
```

Utilisez `repo-harness-prd` quand la source est encore une idée produit : il
lance d'abord un direction pass `$geju`, puis demande à Claude via `claude -p --model opus`
de rédiger le PRD, avec Codex seulement en fallback. Utilisez
`repo-harness-sprint from-prd <plans/prds/*.prd.md>` pour transformer
un PRD approuvé en Sprint backlog ordonné avec des lignes d'acceptance
vérifiables par machine. Utilisez `repo-harness-goal` seulement lorsqu'un PRD ou
Sprint détaillé existe déjà ; il prépare un prompt `/goal` borné pour
Codex/Claude et garde le PRD/Sprint comme source of truth. Si ce document manque,
le goal command doit le demander avant de lancer une implémentation depuis le chat.

`repo-harness adopt` sert aux dépôts existants ; `repo-harness-scaffold` sert de
branch command pour créer un nouveau projet ou module. `hooks-init`, `docs-init` et
`create-project-dirs` sont des étapes internes, pas des commands publiques.

## Maintainer Reference

Les maintainers qui éditent le package lui-même ont besoin d'un source checkout :

```bash
git clone https://github.com/Ancienttwo/repo-harness.git ~/Projects/repo-harness
cd ~/Projects/repo-harness
bun src/cli/index.ts update
```

`~/Projects/repo-harness` est l'unique source of truth éditable ; les chemins
Claude/Codex locaux (`~/.claude/skills/repo-harness`,
`~/.codex/skills/repo-harness`) sont des runtime entrypoints adossés à des
symlinks. Seul `~/.codex/skills/repo-harness` expose `SKILL.md` et
`assets/skill-commands/` ; `scripts/sync-codex-installed-copies.sh` reconstruit
ces alias et supprime les répertoires retirés `repo-harness-skill` /
`project-initializer`. Le script lie par défaut les chemins runtime au dépôt
source ; définissez `AGENTIC_DEV_LINK_INSTALLED_COPIES=0` pour un staging par
copie, ou `CODEX_SKILLS_ROOT` / `CLAUDE_SKILLS_ROOT` pour des racines alternatives.

### Vérifier le workflow contract de ce dépôt

Lancez le gate complet dans [Verification](#verification) ; `bun run check:ci`
est la commande unique équivalente CI.

### Runtime reference docs

Generic repo-harness runtime/reference docs live in the installed package under
`assets/reference-configs/` and are resolved through the CLI:

```bash
repo-harness docs list
repo-harness docs path harness-overview
repo-harness docs show harness-overview
```

Les valeurs par défaut de l'initializer et du runtime (question flow, plan menu,
template vars, routing external-tooling) sont documentées dans `harness-overview.md`
sous **Initializer and Runtime Model**. Generated and migrated repos still keep
`docs/reference-configs/*.md`, but those files are deterministic pointer stubs.
Repo-local workflow state, policy, checks, runs, handoff packets, context maps,
and helper snapshots stay under `.ai/`.

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
bun src/cli/index.ts adopt --repo . --dry-run
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

- Skill spec : `SKILL.md`
- Root routing docs : `CLAUDE.md`, `AGENTS.md`
- Plan mapping : `assets/plan-map.json`
- Question-pack : `assets/initializer-question-pack.v4.json`
- Shared hooks : `assets/hooks/`
- Runtime reference docs: `assets/reference-configs/` via `repo-harness docs`
- Workflow contract : `assets/workflow-contract.v1.json`
- Hook operations reference : `docs/reference-configs/hook-operations.md`
- Template assembler : `scripts/assemble-template.ts`
- State inspector : `scripts/inspect-project-state.ts`
- External tooling detector: `scripts/check-agent-tooling.sh`
- Scaffolding scripts:
  - `scripts/init-project.sh`
  - `scripts/create-project-dirs.sh`
- Canonical adoption planner: `src/core/adoption/standard-plan.ts`

## Generated vs Self-Hosted Hook Projection

- Le comportement downstream des hooks est défini par la sortie générée depuis `assets/hooks/` et `assets/reference-configs/`.
- Ce repo dogfoode le même contract, mais le comportement self-host ne se synchronise pas magiquement avec les generated repos ; un changement doit mettre à jour explicitement les deux surfaces lorsque nécessaire.
- Chaque changement de hook doit dire s'il affecte `self-host`, `generated` ou `both`.

## Package Manager Defaults

- Priorité générale par défaut : `bun > pnpm > npm`
- **Plan G/H** (Python-centric) utilise **`uv`** comme primary package manager par défaut.

## Runtime Profiles

- `Plan-only (recommended)` (default)
- `Plan + Permissionless`
- `Standard (ask before each action)`

Configuré dans `assets/initializer-question-pack.v4.json` et consommé par `scripts/initializer-question-pack.ts`.

## Verification

Pour la release review, utilisez le gate unique équivalent CI :

```bash
bun run check:ci
```

Ce gate se développe vers les checks possédés par le repo ; `bun run check:release` ajoute seulement le preflight npm unpublished-version avant de déléguer au même gate.

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts adopt --repo . --dry-run
bash scripts/check-agent-tooling.sh --host both --check-updates
bun run benchmark:skills --eval route-workflow-check
```
