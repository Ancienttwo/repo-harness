<div align="center">

# repo-harness

### Contexte partagé, hooks et preuves de revue pour Claude et Codex

[![npm version](https://img.shields.io/npm/v/repo-harness.svg)](https://www.npmjs.com/package/repo-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

**Donnez à l’agent une issue GitHub et des critères d’acceptation. Consignez les changements et leur vérification dans la PR.**

</div>

`repo-harness` fournit un CLI, des skills et des hooks pour le contexte, la
revue et les handoffs. L’issue et la PR GitHub définissent le travail, sa portée
et son état. Les fichiers du dépôt permettent de reprendre entre les sessions.

## Installation

Prérequis : un working tree Git, `bun` et un `herdr` utilisable. La liste
complète des prérequis est dans [README.md](README.md#get-started).

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex
```

Si Bun est déjà dans le PATH, vous pouvez aussi lancer :

```bash
bunx repo-harness@latest install     # Bun one-shot bootstrap
npx -y repo-harness@latest install   # npx fallback; the CLI still runs on Bun
```

## Première commande

À la racine du dépôt cible, prévisualisez d'abord, puis appliquez :

```bash
repo-harness init --dry-run
repo-harness init
```

`--dry-run` liste seulement les fichiers à créer ou à rafraîchir. Il n'écrit aucun fichier.

## Documentation complète

Cette page est une page d'accueil courte. Le [README.md](README.md) en anglais est
la seule documentation complète et à jour.

## Licence

MIT
