/**
 * Which screen the plugin view shows. Page buttons (REVEAL) set the route and
 * then open the view; the App re-renders through `useRoute`.
 */
import {useSyncExternalStore} from 'react';

export type Route =
  | {screen: 'menu'}
  | {screen: 'reveal'; puzzleId: string; notePath: string; nonce: number};

let current: Route = {screen: 'menu'};
const listeners = new Set<() => void>();

export function getRoute(): Route {
  return current;
}

export function setRoute(r: Route): void {
  current = r;
  for (const l of listeners) {
    l();
  }
}

export function subscribeRoute(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribeRoute, getRoute, getRoute);
}
