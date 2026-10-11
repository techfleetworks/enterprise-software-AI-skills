# Node.js Docker

## What it is

How to build a Node.js Docker image that is small, reproducible, and safe to run in production: a pinned base
image, production-only dependencies, a non-root user, correct signal handling, and no secrets left behind in
the layers. This is the per-sheet guidance from the OWASP Node.js Docker Cheat Sheet, condensed to the controls
that hold and the problems they stop.

## The attack it stops

The sloppy Node.js Dockerfile pattern (`FROM node`, `COPY .`, `npm ci`, `CMD "npm" "start"`, running as root)
quietly creates several problems at once. A floating base tag means the same Dockerfile builds a different,
possibly vulnerable image each time. A full base image drags in hundreds of known vulnerabilities and dev-only
packages you never ship. Running the app as root means a command-injection or path-traversal bug in the app
runs with full control of the container and a better shot at a breakout. A secret like an `NPM_TOKEN` passed
carelessly stays readable in an image layer or in `docker history` long after you think it is gone. And an app
started through a shell or the npm client may never receive the `SIGTERM` an orchestrator sends, so it is killed
hard and drops live connections.

## Controls

In the cheat sheet's order:
1. **Pin the base image precisely.** Do not rely on `node` or `:latest`. Choose the LTS slim variant
   (`node:lts-alpine`) to cut size and vulnerability surface, and pin it to its `@sha256:` digest so every
   build pulls the exact same bytes.
2. **Install production dependencies only.** Use `npm ci --omit=dev` so the lockfile is honored exactly and no
   `devDependencies` are added to the image; the build fails if anything drifts from the lockfile.
3. **Set the production mode flag.** Add `ENV NODE_ENV production` so frameworks turn on their performance and
   security optimizations, which many libraries gate on that value.
4. **Do not run as root.** Switch to the built-in `node` user with `USER node`, and copy files with
   `COPY --chown=node:node` so the app does not own its files as root. Dropping to `USER` alone leaves the
   copied files root-owned.
5. **Let signals reach the process.** Start the app in exec form (`CMD ["node", "server.js"]`), not shell form
   or through the npm client, since neither forwards signals. Because PID 1 gets special kernel treatment, run a
   tiny init such as `dumb-init` as PID 1 so `SIGTERM` and friends are proxied to Node.
6. **Shut down gracefully.** Add handlers for `SIGINT` and `SIGTERM` that finish in-flight requests, close
   database connections, and then exit, so clients are not cut off mid-request when a container is replaced.
7. **Scan the image for vulnerabilities.** Find and fix known issues in the image with a scanner, as covered by
   the Docker Security guidance on static analysis tools.
8. **Use multi-stage builds.** Build and compile in a first stage, then copy only the resulting `node_modules`
   and app into a small production stage. This keeps build tools and any build-time secret out of the shipped
   image, since a secret deleted in a later `RUN` still lives in an earlier layer and in build-arg history.
9. **Add a `.dockerignore`.** Exclude `node_modules`, `.git`, the `Dockerfile`, local `.env` and credential
   files, and logs so a wildcard `COPY .` cannot pull modified modules or secrets into the image, and so builds
   cache better.
10. **Mount build secrets, never copy them.** Supply a private-registry token to the build stage with
    `RUN --mount=type=secret` so the `.npmrc` is available only during that step and never written into a layer;
    also list it in `.dockerignore`.

## @security scenario

```gherkin
@security @owasp:nodejs-docker @usecase:non-root-no-secret-leak
Scenario: The Node.js image runs unprivileged and leaks no build secret
  Given a Node.js application built into a Docker image
  When the image is inspected and the container is started
  Then the application process runs as the node user, not root
  And the base image is pinned to a sha256 digest
  And no NPM_TOKEN or .npmrc secret is present in any image layer or build history
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually keeps the image safe is how it is built: a digest-pinned minimal base, production-only
dependencies, a non-root user, an init that forwards signals, and secrets mounted rather than copied so no layer
carries them. The `@security` scenario proves the container runs unprivileged and holds no leaked token; the
build choices are what make every rebuild reproduce that same safe image. A test is a check; the hardened
Dockerfile is the guarantee.

## Sources

- OWASP Node.js Docker Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/NodeJS_Docker_Cheat_Sheet.html>, retrieved 2026-10-11): the ten practices (digest-pinned minimal base image, production-only install, NODE_ENV, non-root user with chowned files, exec-form CMD with dumb-init as PID 1, graceful shutdown, vulnerability scanning, multi-stage builds, .dockerignore, and mounted build secrets). `[documented]`
