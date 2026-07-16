# Navigation

go_router as the default, with its maintenance-mode caveat named up front.

## Default: go_router

Google's declarative wrapper over Navigator 2.0 (`Router` API): a route table, deep-link parsing and URL sync, nested navigation via `ShellRoute`/`StatefulShellRoute`, and `redirect` guards, all without hand-writing a `RouterDelegate`.

**Caveat, load-bearing:** go_router is in Flutter-team maintenance mode. The core team ships bug and security fixes only, no new features; community PRs still land, so it's maintained, not abandoned. For a long-lived app weigh `auto_route` (codegen typed routes, actively developed) as the hedge before committing.

## Type-Safe Routes

Prefer `go_router_builder` (`@TypedGoRoute`) so route params are compile-checked, over stringly-typed navigation that only fails at runtime:

```dart
// fragile: a typo in the path or a wrong-typed id is a runtime bug
context.go('/user/$id');

// checked: the generated route class validates params at compile time
UserRoute(id: id).go(context);
```

## Guards and Redirects

- Gate auth with `redirect` at the router or route level: read auth state, return the login path when unauthenticated. Keep the redirect pure and synchronous where possible.
- Re-run the redirect on auth change with `refreshListenable` tied to your auth provider, so a sign-out bounces the user out.

## Nested and Tabbed Flows

- `StatefulShellRoute.indexedStack` for bottom-nav tabs that keep their own state and scroll position across switches.
- Don't mix imperative `Navigator.push` with go_router for the same flows: the URL and router state fall out of sync. Navigate with `context.go` / `context.push` from the router.

## Raw Navigator 2.0

A hand-rolled `RouterDelegate` + `RouteInformationParser` still exists for teams needing deep custom control, but it's far more boilerplate for the same deep-link and nested-nav outcome go_router gives for free. Reach for it only when go_router genuinely can't express the flow.
