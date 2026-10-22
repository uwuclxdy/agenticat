// the installer lets a manifest name reach a path join only when it matches this, and the
// linter holds every def's name to it, so no def installs once and is dropped on --update.
export const AGENT_NAME = /^[a-z0-9][a-z0-9-]*$/;
