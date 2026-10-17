<div align="center">

# repo-harness

### Contexto compartido, hooks y evidencia de revisión para Claude y Codex

[![npm version](https://img.shields.io/npm/v/repo-harness.svg)](https://www.npmjs.com/package/repo-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

**Dale al agente una issue de GitHub y criterios de aceptación. Registra los cambios y su verificación en la PR.**

</div>

`repo-harness` ofrece un CLI, skills y hooks para el contexto, la revisión y
los handoffs. La issue y la PR de GitHub definen el trabajo, su alcance y su
estado. Los archivos del repositorio permiten continuar entre sesiones.

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
