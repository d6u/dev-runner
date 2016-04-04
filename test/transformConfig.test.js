'use strict';

const test = require('tape');
const proxyquire = require('proxyquire').noCallThru();
const td = require('testdouble');
const Rx = require('rx');

test('"transformConfig" throws if both start and process are defined', function (t) {
  t.plan(1);

  const transformConfig = require('../lib/utils').transformConfig;

  function run() {
    transformConfig('name', {start: 'command a', process: () => {}});
  }

  t.throws(run, '"name" has both "start" and "process" defined');
});

test('"transformConfig" throws if neither start nor process is defined', function (t) {
  t.plan(1);

  const transformConfig = require('../lib/utils').transformConfig;

  function run() {
    transformConfig('name', {});
  }

  t.throws(run, '"start" or "process" be defined "name"');
});

test('"transformConfig" spawns "start"', function (t) {
  t.plan(1);

  const func = td.function();
  td.when(func(td.matchers.anything())).thenDo(() => new Rx.BehaviorSubject(null));

  const transformConfig = proxyquire('../lib/utils', {
    './ShellUtil': {
      spawn: func
    }
  }).transformConfig;

  const r = transformConfig('taskName', {
    start: 'command a'
  });

  r.process({}).subscribe(() => {});

  t.doesNotThrow(() => {
    td.verify(func('command a'), {times: 1});
  });
});

test('"transformConfig" spawns "preStart"', function (t) {
  t.plan(1);

  const func = td.function();
  td.when(func(td.matchers.anything())).thenDo(() => Rx.Observable.just(null));

  const transformConfig = proxyquire('../lib/utils', {
    './ShellUtil': {
      spawn: func
    }
  }).transformConfig;

  const r = transformConfig('taskName', {
    preStart: 'command a',
    start: 'command b'
  });

  r.process({}).subscribe(() => {});

  t.doesNotThrow(() => {
    td.verify(func('command a'), {times: 1});
    td.verify(func('command b'), {times: 1});
  });
});

test('"transformConfig" emit action on "preStart"', function (t) {
  t.plan(1);

  const func = td.function();
  td.when(func('command a')).thenDo(() => Rx.Observable.just('Match me'));
  td.when(func('command b')).thenDo(() => Rx.Observable.just('some string'));

  const transformConfig = proxyquire('../lib/utils', {
    './ShellUtil': {
      spawn: func
    }
  }).transformConfig;

  const r = transformConfig('taskName', {
    preStart: 'command a',
    start: 'command b',
    events: [
      {regex: /Match me/, actionData: {type: 'test'}}
    ]
  });

  r.process({}).subscribe((action) => {
    t.deepEqual(action, {type: 'test'});
  });
});

test('"transformConfig" emit action on "start"', function (t) {
  t.plan(1);

  const func = td.function();
  td.when(func('command b')).thenDo(() => Rx.Observable.just('Match me'));

  const transformConfig = proxyquire('../lib/utils', {
    './ShellUtil': {
      spawn: func
    }
  }).transformConfig;

  const r = transformConfig('taskName', {
    start: 'command b',
    events: [
      {regex: /Match me/, actionData: {type: 'test'}}
    ]
  });

  r.process({}).subscribe((action) => {
    t.deepEqual(action, {type: 'test'});
  });
});

test('"transformConfig" invokes "process"', function (t) {
  t.plan(1);

  const funcA = td.function();
  const funcB = td.function();

  const transformConfig = proxyquire('../lib/utils', {
    './ShellUtil': {
      spawn: funcA
    }
  }).transformConfig;

  const r = transformConfig('taskName', {
    process: funcB
  });

  r.process({}).subscribe(() => {});

  t.doesNotThrow(() => {
    td.verify(funcA(td.matchers.anything()), {times: 0, ignoreExtraArgs: true});
    td.verify(funcB(td.matchers.anything(), td.matchers.anything()), {times: 1});
  });
});

test('"transformConfig" emits action on "process" output', function (t) {
  t.plan(2);

  const funcA = td.function();

  const transformConfig = proxyquire('../lib/utils', {
    './ShellUtil': {
      spawn: funcA
    }
  }).transformConfig;

  const r = transformConfig('taskName', {
    process(input, output) {
      output.emit('action', {
        type: 'test'
      });
    }
  });

  r.process({}).subscribe((action) => {
    t.deepEqual(action, {
      type: 'test'
    });
  });

  t.doesNotThrow(() => {
    td.verify(funcA(td.matchers.anything()), {times: 0, ignoreExtraArgs: true});
  });
});

test('"transformConfig" "ready" action from parent task triggers "start"', function (t) {
  t.plan(2);

  const funcA = td.function();
  td.when(funcA(td.matchers.anything())).thenDo(() => new Rx.BehaviorSubject(null));

  const transformConfig = proxyquire('../lib/utils', {
    './ShellUtil': {
      spawn: funcA
    }
  }).transformConfig;

  const r = transformConfig('taskName', {
    dependsOn: ['a'],
    start: 'command b'
  });

  const subject = new Rx.Subject();

  r.process({a: subject}).subscribe(() => {});

  t.doesNotThrow(() => {
    td.verify(funcA(td.matchers.anything()), {times: 0, ignoreExtraArgs: true});
  });

  subject.onNext({type: 'ready'});

  t.doesNotThrow(() => {
    td.verify(funcA('command b'), {times: 1});
  });
});

test('"transformConfig" "ready" action from all parent tasks triggers "start"', function (t) {
  t.plan(3);

  const funcA = td.function();
  td.when(funcA(td.matchers.anything())).thenDo(() => new Rx.BehaviorSubject(null));

  const transformConfig = proxyquire('../lib/utils', {
    './ShellUtil': {
      spawn: funcA
    }
  }).transformConfig;

  const r = transformConfig('taskName', {
    dependsOn: ['a', 'b'],
    start: 'command b'
  });

  const subjectA = new Rx.Subject();
  const subjectB = new Rx.Subject();

  r.process({a: subjectA, b: subjectB}).subscribe(() => {});

  t.doesNotThrow(() => {
    td.verify(funcA(td.matchers.anything()), {times: 0, ignoreExtraArgs: true});
  });

  subjectA.onNext({type: 'ready'});

  t.doesNotThrow(() => {
    td.verify(funcA(td.matchers.anything()), {times: 0, ignoreExtraArgs: true});
  });

  subjectB.onNext({type: 'ready'});

  t.doesNotThrow(() => {
    td.verify(funcA('command b'), {times: 1});
  });
});

test('"transformConfig" "ready" action from all parent tasks triggers "preStart"', function (t) {
  t.plan(3);

  const funcA = td.function();
  td.when(funcA(td.matchers.anything())).thenDo(() => new Rx.Observable.just(null));

  const transformConfig = proxyquire('../lib/utils', {
    './ShellUtil': {
      spawn: funcA
    }
  }).transformConfig;

  const r = transformConfig('taskName', {
    dependsOn: ['a', 'b'],
    preStart: 'command a',
    start: 'command b'
  });

  const subjectA = new Rx.Subject();
  const subjectB = new Rx.Subject();

  r.process({a: subjectA, b: subjectB}).subscribe(() => {});

  t.doesNotThrow(() => {
    td.verify(funcA(td.matchers.anything()), {times: 0, ignoreExtraArgs: true});
  });

  subjectA.onNext({type: 'ready'});

  t.doesNotThrow(() => {
    td.verify(funcA(td.matchers.anything()), {times: 0, ignoreExtraArgs: true});
  });

  subjectB.onNext({type: 'ready'});

  t.doesNotThrow(() => {
    td.verify(funcA('command a'), {times: 1});
    td.verify(funcA('command b'), {times: 1});
  });
});

test('"transformConfig" "ready" action from single parent task will respawn "start"', function (t) {
  t.plan(2);

  const funcA = td.function();
  td.when(funcA(td.matchers.anything())).thenDo(() => new Rx.Observable.just(null));

  const transformConfig = proxyquire('../lib/utils', {
    './ShellUtil': {
      spawn: funcA
    }
  }).transformConfig;

  const r = transformConfig('taskName', {
    dependsOn: ['a'],
    start: 'command b'
  });

  const subjectA = new Rx.Subject();

  r.process({a: subjectA}).subscribe(() => {});

  subjectA.onNext({type: 'ready'});

  t.doesNotThrow(() => {
    td.verify(funcA('command b'), {times: 1});
  });

  subjectA.onNext({type: 'ready'});

  t.doesNotThrow(() => {
    td.verify(funcA('command b'), {times: 2});
  });
});

test('"transformConfig" listens to action on "process" input', function (t) {
  t.plan(1);

  const funcA = td.function();

  const transformConfig = proxyquire('../lib/utils', {
    './ShellUtil': {
      spawn: funcA
    }
  }).transformConfig;

  const subjectA = new Rx.Subject();

  const r = transformConfig('taskName', {
    dependsOn: ['a'],
    process(input, output) {
      input.on('action', (action) => {
        t.deepEqual(action, {type: 'action'});
      });
    }
  });

  r.process({a: subjectA}).subscribe(() => {});

  subjectA.onNext({type: 'ready'});
  subjectA.onNext({type: 'action'});
});
