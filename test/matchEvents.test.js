'use strict';

const test = require('tape');
const matchEvents = require('../lib/utils').matchEvents;

test('"matchEvents" returns undefined if no match', function (t) {
  t.plan(1);

  const events = [
    {regex: /Server shutdown/, actionData: {type: 'test2'}},
    {regex: /Server start/, actionData: {type: 'test1'}},
  ];

  const r = matchEvents(events)('Server error');

  t.equal(r, undefined);
});

test('"matchEvents" returns action data', function (t) {
  t.plan(1);

  const events = [
    {regex: /Server shutdown/, actionData: {type: 'test2'}},
    {regex: /Server start/, actionData: {type: 'test1'}},
  ];

  const r = matchEvents(events)('Server start');

  t.deepEqual(r, {type: 'test1'});
});

test('"matchEvents" calls "actionData"', function (t) {
  t.plan(1);

  const events = [
    {regex: /Server shutdown/, actionData: {type: 'test2'}},
    {regex: /Server start/, actionData: () => ({type: 'test1'})},
  ];

  const r = matchEvents(events)('Server start');

  t.deepEqual(r, {type: 'test1'});
});
