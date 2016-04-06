import {EventEmitter} from 'events';
import {Observable, ConnectableObservable, Observer, CompositeDisposable, Disposable} from 'rx';
import * as Promise from 'bluebird';
import {toPairs, values, pipe, map, propEq, always, identity} from 'ramda';
import {spawn} from './ShellUtil';

export interface EventMatcher {
  regex: RegExp;
  actionData: Object | ((str: string) => Object);
}

export interface DevRunnerTaskConfig {
  dependsOn?: string[];
  preStart?: string;
  start?: string;
  events?: EventMatcher[];
  process?: ((input: EventEmitter, output: EventEmitter) => void);
  watch?: string[];
  readyAfter?: number;
}

export interface Configs {
  [key: string]: DevRunnerTaskConfig;
}

export interface TransformedTaskConfig {
  dependsOn?: string[];
  process: ((tasks: {[key: string]: Observable<any>}) => Observable<any>);
}

export interface TransformedConfigs {
  [key: string]: TransformedTaskConfig;
}

export function transformConfigs(configs: Configs): TransformedConfigs {
  const transformConfigs: TransformedConfigs = {};

  for (const key of Object.keys(configs)) {
    transformConfigs[key] = transformConfig(key, configs[key]);
  }

  return transformConfigs;
}

interface Action {
  type: string;
}

export function transformConfig(key: string, config: DevRunnerTaskConfig): TransformedTaskConfig {
  const {dependsOn, preStart, start, events, process, watch, readyAfter} = config;

  if (start && process) {
    throw new Error(`"${key}" has both "start" and "process" defined`);
  }

  if (!start && !process) {
    throw new Error(`"start" or "process" be defined "${key}"`);
  }

  return {
    dependsOn,
    process(tasks: {[key: string]: Observable<Action>}) {
      return Observable.create<Action>((observer) => {
        const parents = values(tasks).map(s => s.publish());
        const match = events ? matchEvents(events) : null;

        // Should be Observable<Action> type, because for observables
        // that doesn't emit Actions, we only take the completed event
        // Use <any> as a workaround
        const observableCandidates: Observable<any>[] = [];

        let readyObservables: Observable<Action>[];

        if (parents.length) {
          readyObservables = parents.map(s => s.filter(propEq('type', 'ready')));
          const allReadyObservable = Observable
            .combineLatest(readyObservables, null)
            .take(1)
            .ignoreElements() as Observable<Action>;

          observableCandidates.push(allReadyObservable);
        }

        if (preStart) {
          const preStartObservable = spawn(preStart);

          if (match) {
            observableCandidates.push(preStartObservable.map(match).filter(identity) as Observable<Action>);
          } else {
            observableCandidates.push(preStartObservable.ignoreElements());
          }
        }

        if (start) {
          let startObservable: Observable<string>;

          if (readyObservables) {
            startObservable = Observable
              .merge(...readyObservables)
              .startWith(null)
              .flatMapLatest(() => spawn(start));
          } else {
            startObservable = spawn(start);
          }

          if (match) {
            observableCandidates.push(startObservable.map(match).filter(identity) as Observable<Action>);
          } else {
            observableCandidates.push(startObservable.ignoreElements());
          }
        } else { // "process"
          const processObservable = Observable.create<Action>((observer) => {
            const input = new EventEmitter();
            const output = new EventEmitter();

            output.on('action', (obj: Action) => {
              observer.onNext(obj);
            });

            process(input, output);

            let disposable: Disposable;

            if (parents.length) {
              disposable = Observable
                .merge(...parents)
                .subscribeOnNext((action: Action) => input.emit('action', action));
            }

            return () => {
              if (disposable) {
                disposable.dispose();
              }
              input.removeAllListeners();
              output.removeAllListeners();
            };
          });

          observableCandidates.push(processObservable);
        }

        const bag = new CompositeDisposable();

        bag.add(Observable.concat(...observableCandidates).subscribe(observer));

        if (parents.length) {
          parents.forEach(s => bag.add(s.connect()));
        }

        return () => {
          bag.dispose();
        };
      });
    }
  };
}

export function matchEvents(events: EventMatcher[]) {
  return function (val: string) {
    for (const {regex, actionData} of events) {
      if (regex.test(val)) {
        let obj: Object;
        if (typeof actionData === 'function') {
          obj = (actionData as (str: string) => Object)(val);
        } else {
          obj = actionData;
        }
        return obj;
      }
    }
  };
}
