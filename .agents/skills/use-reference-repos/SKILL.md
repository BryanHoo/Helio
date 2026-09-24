---
name: use-reference-repos
description: Pull and inspect open-source reference code under .repos. Use when the user asks to examine code from an upstream project, when debugging or implementing an integration would benefit from reading dependency source, or when comparing Codevisor behavior with another open-source project.
---

# Use reference repositories

Use the ignored `.repos` directory for optional open-source source-code references. It is not a Git submodule tree.

Fetch only the repository needed for the task. Never add a reference checkout to the project commit.

## Get a reference

Clone the official upstream into `.repos` when the checkout is absent:

```sh
git clone https://github.com/<owner>/<repository>.git .repos/<repository>
```

If a specific revision matters, check it out in the ignored reference checkout. If current upstream code matters, fetch and inspect the remote branch:

```sh
git -C .repos/<repository> fetch origin
```

## Rules

- Pull only references relevant to the task.
- Treat reference repositories as upstream source to inspect. Do not edit their contents unless the user explicitly asks to modify or contribute to that project.
- Prefer source inspection over guessing when behavior depends on an upstream implementation.
- Report the upstream repository and commit used when the answer or implementation materially depends on it.
