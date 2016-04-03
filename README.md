# DevRunner

A development task runner to start dev servers and other task runners in the order you want.

## Install

```sh
npm install --save-dev dev-runner
```

## Configuration

```typescript
interface EventMatcher {
  regex: RegExp;
  actionData: Object | (str: string) => Object;
}

interface Config {
  [key: string]: {
    dependsOn?: string[];
    preStart?: string;
    start?: string;
    events?: EventMatcher[];
    process?: (input: EventEmitter, output: EventEmitter) => void;
    watch?: string[];
    readyAfter?: number;
  }
}
```

- `dependsOn?: string[]`: tasks that must be ready before current task. It detects `{type: 'ready'}` action as a single of ready. If multiple tasks is specified, will wait until all of them is ready before start current task.
- `preStart?: string`: shell command to run before `start` or `process`.
- `start?: string`: long running shell command, typically a watch process. Cannot be appear at the same time as `process`. If more `{type: 'ready'}` action is received, current running process will be killed and new one will be started.
- `events?: EventMatcher[]`: match string output of `preStart` and `start` with an array of regular expression, if matched, defined action will be emitted. This property only works if `start` or `preStart` is defined.
    - `regex: RegExp`
    - `actionData: Object | (str: string) => Object` Predefined action object, or a function to generate action object based on matched input string.
    - `{type: 'ready'}` is a special action to notify following tasks current task is ready. It could be emitted multiple times.
- `process?: (input: EventEmitter, output: EventEmitter) => void`: Run some custom code, e.g. live reload server.
    - `input: EventEmitter`: all event will have a `type` key.
        - `{type: 'ready'}`
        - `{type: 'watch'; changeType: string; path: string}`: `changeType` can be "add", "change", "unlink".
    - `output: EventEmitter`
- `watch?: string[]`: emit file change event to `process`. Only works if `process` is defined.
- `readyAfter?: number`: emit `{type: 'ready'}` action after `x` milliseconds.
