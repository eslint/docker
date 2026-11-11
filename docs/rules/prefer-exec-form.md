# prefer-exec-form

Require the exec (JSON array) form for `CMD` and `ENTRYPOINT`.

## Background

`CMD` and `ENTRYPOINT` accept two forms:

```dockerfile
# shell form
CMD npm start

# exec form
CMD ["npm", "start"]
```

The shell form wraps the command in `/bin/sh -c`, so the shell — not your
program — becomes PID 1. Signals such as the SIGTERM sent by
`docker stop` go to the shell and are typically not forwarded, which
means containers take the full stop timeout and are then killed. The
exec form runs the program directly, so it receives signals and shuts
down cleanly. The two forms also compose differently: a shell-form `CMD`
does not append its arguments to an exec-form `ENTRYPOINT`.

## Rule Details

This rule warns when a `CMD` or `ENTRYPOINT` instruction uses the shell
form. When the command is a simple sequence of words with no shell
features (variables, quoting, pipes, redirection, leading environment
assignments, or shell builtins such as `exec`), the rule fixes it by
rewriting the command as a JSON array. Commands that rely on shell
features are reported without a fix, since converting them requires
deciding how to handle the shell.

`RUN` instructions are not checked; the shell form is the normal way to
write them.

Examples of **incorrect** code for this rule:

```dockerfile
# eslint docker/prefer-exec-form: "error"

FROM node:20
ENTRYPOINT /docker-entrypoint.sh
CMD npm start
```

Examples of **correct** code for this rule:

```dockerfile
# eslint docker/prefer-exec-form: "error"

FROM node:20
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["npm", "start"]
```

## Options

This rule has no options.

## When Not to Use It

If a `CMD` or `ENTRYPOINT` genuinely needs shell processing — environment
variable expansion, for example — the shell form is legitimate. Consider
making the shell explicit (`CMD ["sh", "-c", "..."]`), or disable this
rule for that line with a configuration comment.

## Prior Art

- [hadolint DL3025](https://github.com/hadolint/hadolint/wiki/DL3025)
- [`JSONArgsRecommended`](https://docs.docker.com/reference/build-checks/json-args-recommended/)
  build check
