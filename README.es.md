<div align="center">

# repo-harness

### Un flujo de trabajo basado en archivos para Claude y Codex, y un runtime autorizado para los programas construidos sobre él

[![npm version](https://img.shields.io/npm/v/repo-harness.svg)](https://www.npmjs.com/package/repo-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

**Dale al agente un PRD o Sprint completo; después, tu bucle es solo revisar y `next`, o inicia `/goal` y ponte AFK.**

</div>

`repo-harness` distribuye un CLI junto con hooks de skill/runtime que escriben
contexto, planes, handoffs, checks y evidencia de review de vuelta en el
proyecto, de modo que la siguiente sesión de agente continúa desde archivos en
lugar del historial de chat. Adopta un repositorio existente con un contract
de agente tasks-first que mantiene alineados a Claude y Codex.

## Instalación

Requisitos: un working tree de Git, `bun` y un `herdr` utilizable. La lista
completa de requisitos está en [README.md](README.md#get-started).

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex
```

Si Bun ya está en el PATH, también puedes ejecutar:

```bash
bunx repo-harness@latest install     # Bun one-shot bootstrap
npx -y repo-harness@latest install   # npx fallback; the CLI still runs on Bun
```

## Primer comando

En la raíz del repositorio de destino, primero previsualiza y después aplica:

```bash
repo-harness init --dry-run
repo-harness init
```

`--dry-run` solo informa de los archivos que se crearían o refrescarían. No escribe ningún archivo.

## Documentación completa

Esta página es una portada breve. El [README.md](README.md) en inglés es la única
documentación completa y actual.

## Licencia

MIT
