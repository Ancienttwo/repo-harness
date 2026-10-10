---
name: windows-python-first
description: Use for agent tasks in native Windows that need file edits, text conversion, JSON processing, or shell commands with quoting or encoding problems. Prefer Python for these operations. Do not apply Windows shell rules to macOS, Linux, or WSL.
---

# Windows Python First

Worker entrypoint. Confirm that the task runs in native Windows before using these rules.

Use Python for file and text operations in native Windows. Use PowerShell to launch programs and for Windows APIs that require it. Keep direct Git, build, and test commands when they already work.

## Select the runtime

Confirm the OS and the shell from the tool context. If needed, use `$PSVersionTable.PSVersion` to identify the PowerShell version. A Windows host can run a WSL shell. Use Linux rules inside WSL.

Use the project's Python interpreter when it has one. Otherwise, check `py -3 --version`. If that command is unavailable, check `python --version`. Confirm Python 3 and its executable path before use. A command name alone does not prove that an interpreter is installed.

For file and text work, launch the selected interpreter with `-X utf8`. This enables Python UTF-8 mode. It does not change the encoding of other programs or prove that PowerShell will decode their output correctly.

If Python is unavailable, use an existing file-edit tool. Use a short PowerShell command only when its behavior is clear. Report a missing runtime when it blocks the task. Do not install software or change system settings without task authorization.

## Choose the smallest operation

- Use an available file-edit tool for a small source patch.
- Use Python for file reads and writes, text replacement, JSON, CSV, and batch file operations. Prefer its standard library.
- Use direct commands for Git, package managers, builds, and tests. Do not add a Python wrapper without a reason.
- Use PowerShell for Windows services, registry operations, and PowerShell modules when the task requires them.

## Keep shell commands simple

Put multi-line Python code in a UTF-8 `.py` file with the file-edit tool. Store temporary helpers in the task's scratch directory. Do not put them in tracked source without a project reason.

Pass paths and data as arguments. Read them through `sys.argv` or `argparse`. Do not insert user text, JSON, regexes, or Windows paths into generated source code.

Use a one-line launch command. These examples assume the task script already exists:

```powershell
py -3 -X utf8 "C:\work\task\edit_text.py" "C:\work\project\file.txt"
```

When using a quoted executable path, use the PowerShell call operator:

```powershell
& "C:\work\project\.venv\Scripts\python.exe" -X utf8 "C:\work\task\edit_text.py" "C:\work\project\file.txt"
```

Avoid long `python -c` strings, nested shell commands, and piping multi-line source through PowerShell. Do not use Bash heredocs in PowerShell. Do not use PowerShell `>` or `Out-File` to create source files with an assumed encoding. Windows PowerShell 5.1 and PowerShell 7 have different encoding defaults.

When Python starts a native executable, pass an argument list to `subprocess.run`. Use `shell=False` and an explicit `cwd`. Inspect the return code. For `.cmd` or `.bat` tools, account for Windows shell parsing; do not assume an argument list removes that boundary.

## Preserve file contents

Set the encoding for each text file operation. Use UTF-8 without a BOM for new source files unless the project requires another format. Preserve the encoding, BOM, and line endings of existing files.

For a targeted edit, read bytes first. Identify the BOM and the expected encoding. Decode with strict error handling. Do not use `errors="ignore"` or `errors="replace"` for source edits. If the encoding is unknown, obtain evidence before writing.

Byte reads and writes can preserve CRLF without implicit newline conversion. Make only the requested replacement. Check the expected match count before writing. A missing or extra match must fail before the write. Preserve unrelated text and the final newline.

Use `pathlib.Path` for paths. Use `json` and `csv` for their formats. Avoid whole-file reserialization when it would change unrelated content.

## Resolve failures and verify

After a quoting, pipe, or encoding failure, identify the failing boundary. Move file or text logic into a Python file instead of repeatedly changing a long shell expression. Do not change the terminal code page, PowerShell profile, execution policy, or global environment as a routine fix.

Read back the output. Check the changed content and file format. Inspect the diff when the task is in Git. Run the relevant project checks and record their exit codes. Do not treat a successful launch as proof that the requested change is correct.

Report Windows validation only when checks ran on Windows. A check on macOS or Linux is partial evidence for this skill.

## Sources

This skill adapts the post's Python-first recommendation. It does not reproduce the unavailable comment prompt.

- [Vincent's post](https://x.com/Vincent_AINotes/status/2108826853217800231).
- [Python command-line options](https://docs.python.org/3/using/cmdline.html): `-X utf8`.
- [Python pathlib](https://docs.python.org/3/library/pathlib.html): text and byte file operations.
- [PowerShell character encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding): version differences and file redirection.
