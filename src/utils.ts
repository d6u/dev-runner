import {EventEmitter} from 'events';
import {Observable, ConnectableObservable, Observer, CompositeDisposable, Disposable} from 'rx';
import * as Promise from 'bluebird';
import {toPairs, values, pipe, map, propEq} from 'ramda';
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
    process(tasks: {[key: string]: Observable<any>}): Observable<Object> {
      return Observable.create((observer: Observer<Object>) => {
        const match = events ? matchEvents(events) : null;
        const bag = new CompositeDisposable();
        const observerables: Observable<any>[] = values(tasks);

        let s1: Observable<any>;
        let connectables: ConnectableObservable<any>[];
        let readyActionObservables: Observable<{type: 'ready'}>[];

        if (observerables.length) {
          connectables = observerables.map((s) => s.publish());
          readyActionObservables =
            connectables.map((s) => s.filter(propEq('type', 'ready')));

          const allParentsReady: Observable<{type: 'ready'}[]> =
            Observable.combineLatest.apply(null, readyActionObservables).take(1);

          s1 = allParentsReady;
        } else {
          s1 = Observable.just(null);
        }

        if (preStart) {
          s1 = s1.flatMap(() => spawn(preStart));

          if (match) {
            s1 = s1.doOnNext((val: string) => {
              const action = match(val);
              if (action) {
                observer.onNext(action);
              }
            });
          }
        }

        let input: EventEmitter;
        let output: EventEmitter;

        bag.add(s1.subscribeOnCompleted(() => {
          if (start) {
            let s2: Observable<string>;

            if (readyActionObservables) {
              s2 = Observable
                .merge
                .apply(null, readyActionObservables)
                .startWith(null)
                .flatMapLatest(() => spawn(start));
            } else {
              s2 = spawn(start);
            }

            let d: Disposable;

            if (match) {
              d = s2.subscribeOnNext((val) => {
                const action = match(val);
                if (action) {
                  observer.onNext(action);
                }
              });
            } else {
              d = s2.subscribe(() => {});
            }

            bag.add(d);
          } else { // "process"
            input = new EventEmitter();
            output = new EventEmitter();

            output.on('action', (obj: Object) => {
              observer.onNext(obj);
            });

            process(input, output);

            const d = Observable.merge.apply(null, connectables)
              .subscribeOnNext((action: Object) => input.emit('action', action));

            bag.add(d);
          }
        }));

        if (connectables) {
          connectables.forEach((s) => bag.add(s.connect()));
        }

        return () => {
          bag.dispose();
          if (input) {
            input.removeAllListeners();
          }
          if (output) {
            output.removeAllListeners();
          }
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
