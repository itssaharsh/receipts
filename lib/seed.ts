import { createTask, poll, type RunnerDeps } from './runner';
import type { Task, TaskInput } from './types';
import { ACTIVE_STATUSES } from './view';

/** The demo task: the one the recorded take types. Also used by `?demo=1` against the simulated Fo. */
export const DEMO_TASK: TaskInput = {
  text: 'Book my dentist check-up: email Northfield Dental to confirm Thursday 3pm and put it on my calendar',
  counterparty: 'Northfield Dental',
  amountCents: 0,
  category: 'booking',
  postcondition: { kind: 'calendar_event', titleContains: 'Dental', startISO: '2026-10-22T15:00:00+01:00', windowMinutes: 30 },
};

/** Run the demo task to a final state. Only for the simulated Fo: a live Fo is never asked by a page load. */
export async function seedDemo(deps: RunnerDeps): Promise<Task> {
  if (deps.fo.mode !== 'fake') throw new Error('The seed runs only against the simulated Fo; with the live Fo, ask it from the form.');
  let task = await createTask(deps, DEMO_TASK);
  for (let i = 0; i < 20 && ACTIVE_STATUSES.has(task.status); i++) task = await poll(deps, task.id);
  return task;
}
