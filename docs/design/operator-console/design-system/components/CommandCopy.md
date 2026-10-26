# CommandCopy

Commands the console does not run but hands to you to run in a terminal. Uses Kumo `ClipboardText`. Inline ids and SHAs use Kumo `InlineCopyText`.

- The command uses the `code` style, background `color-kumo-recessed`, 1px `color-kumo-interact`, `radius-lg`, 36 to 40px tall.
- After a click, 「已复制」 ("Copied") shows in the same place for about 2 seconds. No toast.
- For commands that delete or overwrite, one line of `text-color-kumo-warning` above states the result (「执行后会直接删除这些行，不留备份」 ("Running this deletes these rows directly, with no backup")). Give the preview command first, then the command that runs it.
- Do not wrap a command as a primary button that looks like it runs directly.
