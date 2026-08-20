export type NewTaskRequest = {
  title?: string;
  variant?: "task" | "event";
  mode?: "simple" | "full";
};

const EVENT = "momentum:new-task";

export function openNewTask(detail: NewTaskRequest = {}) {
  window.dispatchEvent(new CustomEvent<NewTaskRequest>(EVENT, { detail }));
}

export function subscribeNewTask(handler: (detail: NewTaskRequest) => void) {
  const onEvent = (e: Event) => {
    handler((e as CustomEvent<NewTaskRequest>).detail ?? {});
  };
  window.addEventListener(EVENT, onEvent);
  return () => window.removeEventListener(EVENT, onEvent);
}
