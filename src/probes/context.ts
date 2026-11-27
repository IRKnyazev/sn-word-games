import type {LogSink, Logger} from '../diag/logger';
import type {ElementLike, Fetcher, Files, Sdk} from '../sdk/types';
import type {ProbeState} from './state';

export interface Unsubscribe {
  remove(): void;
}

/** Everything a probe needs, injected so probes run against fakes in tests. */
export interface ProbeContext {
  sdk: Sdk;
  files: Files;
  log: Logger;
  fetch: Fetcher;
  state: ProbeState;
  now: () => number;
  date: () => Date;
  /** The log file sink; attached only once FILE:WRITE is granted. */
  makeLogSink: () => LogSink;
  /** Subscribes to pen-up events (only while P2 is armed). */
  listenPenUp: (onElements: (elements: ElementLike[]) => void) => Unsubscribe;
}
